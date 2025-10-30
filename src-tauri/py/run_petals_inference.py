#!/usr/bin/env python3
import sys
import logging
import argparse
import json
import torch

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)]  # Errors to stderr
)
logger = logging.getLogger(__name__)

def main():
    parser = argparse.ArgumentParser(description="Run Petals inference")
    parser.add_argument("--model-name", type=str, required=True,
                        help="HuggingFace model name/ID")
    parser.add_argument("--prompt", type=str, required=True,
                        help="The prompt/question text")
    parser.add_argument("--max-tokens", type=int, default=512,
                        help="Maximum tokens to generate")
    parser.add_argument("--temperature", type=float, default=0.7,
                        help="Sampling temperature")
    parser.add_argument("--stream", action="store_true",
                        help="Stream tokens one by one")
    parser.add_argument("--timeout", type=int, default=500,
                        help="Timeout for connecting to Petals (seconds)")
    parser.add_argument("--conversation-history", type=str, default="[]",
                        help="JSON array of previous messages for context")
    args = parser.parse_args()
    
    try:
        # Import Petals libraries
        logger.info(f"Loading model: {args.model_name}")
        from petals import AutoDistributedModelForCausalLM
        from transformers import AutoTokenizer
        
        # Load tokenizer
        logger.info("Loading tokenizer...")
        print(json.dumps({"status": "loading_tokenizer", "trace": "step_1_tokenizer"}), flush=True)
        try:
            tokenizer = AutoTokenizer.from_pretrained(args.model_name)
            print(json.dumps({"status": "tokenizer_loaded", "trace": "step_1_complete"}), flush=True)
        except Exception as e:
            print(json.dumps({"error": f"Failed to load tokenizer: {str(e)}", "trace": "step_1_failed"}), flush=True)
            sys.exit(1)
        
        # Connect to distributed model on Petals network
        logger.info("Connecting to Petals network DHT...")
        print(json.dumps({"status": "connecting_to_network", "trace": "step_2_dht_init"}), flush=True)
        
        # Add periodic heartbeat during connection
        import threading
        import time
        connection_timeout = [False]
        
        def heartbeat():
            count = 0
            while not connection_timeout[0]:
                time.sleep(5)
                if not connection_timeout[0]:
                    count += 1
                    print(json.dumps({
                        "status": "still_connecting", 
                        "trace": f"step_2_waiting_{count*5}s",
                        "message": f"Still searching for blocks... ({count*5}s)"
                    }), flush=True)
        
        heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
        heartbeat_thread.start()
        
        try:
            logger.info("Calling AutoDistributedModelForCausalLM.from_pretrained()...")
            print(json.dumps({"status": "querying_dht", "trace": "step_2_from_pretrained_start"}), flush=True)
            
            # Use threading timeout that works on Windows/WSL
            import threading
            import time
            
            model_result = [None]
            model_error = [None]
            
            def load_model():
                try:
                    model_result[0] = AutoDistributedModelForCausalLM.from_pretrained(args.model_name)
                except Exception as e:
                    model_error[0] = e
            
            # Start model loading in a thread
            model_thread = threading.Thread(target=load_model)
            model_thread.daemon = True
            model_thread.start()
            
            logger.info(f"Waiting for model loading with timeout: {args.timeout} seconds")
            print(json.dumps({"status": "waiting_for_model", "timeout": args.timeout, "trace": "step_2_waiting"}), flush=True)
            
            # Wait for timeout or completion
            model_thread.join(timeout=args.timeout)
            
            if model_thread.is_alive():
                # Timeout occurred
                logger.error(f"Model loading timed out after {args.timeout} seconds")
                print(json.dumps({"error": f"❌ Timeout: Model loading timed out after {args.timeout} seconds. No blocks found for this model.", "trace": "error_timeout"}), flush=True)
                raise TimeoutError(f"Model loading timed out after {args.timeout} seconds. No blocks found for this model.")
            
            if model_error[0]:
                logger.error(f"Model loading failed: {model_error[0]}")
                print(json.dumps({"error": f"❌ Model loading failed: {str(model_error[0])}", "trace": "error_model_load"}), flush=True)
                raise model_error[0]
            
            model = model_result[0]
            connection_timeout[0] = True
            logger.info("Successfully connected to Petals network")
            print(json.dumps({"status": "connected", "trace": "step_2_complete"}), flush=True)
        except Exception as e:
            connection_timeout[0] = True
            error_msg = str(e)
            logger.error(f"Connection failed: {error_msg}")
            
            # Detailed error categorization
            if "no blocks available" in error_msg.lower():
                error_output = {"error": f"❌ No blocks available: No one is hosting {args.model_name}", "trace": "error_no_blocks"}
            elif "no servers" in error_msg.lower() or "could not find" in error_msg.lower():
                error_output = {"error": f"❌ No servers found: Model {args.model_name} not on network", "trace": "error_no_servers"}
            elif "timeout" in error_msg.lower():
                error_output = {"error": "❌ DHT timeout: Network connection too slow", "trace": "error_timeout"}
            elif "connection" in error_msg.lower():
                error_output = {"error": f"❌ Connection error: {error_msg[:200]}", "trace": "error_connection"}
            else:
                error_output = {"error": f"❌ Unknown error: {error_msg[:300]}", "trace": "error_unknown"}
            
            print(json.dumps(error_output), flush=True)
            sys.exit(1)
        
        # Parse conversation history
        try:
            conversation_history = json.loads(args.conversation_history)
        except Exception as e:
            logger.warning(f"Could not parse conversation history: {e}. Starting with empty history.")
            conversation_history = []

        # Build the prompt using the tokenizer's chat template for robustness
        # This is the recommended way to handle different model formats.
        chat = []
        for msg in conversation_history:
            role = msg.get("role")
            content = msg.get("content")
            if role and content and role in ["user", "assistant"]:
                chat.append({"role": role, "content": content})

        # Add the current user message
        chat.append({"role": "user", "content": args.prompt})

        try:
            # Let the tokenizer handle the formatting. add_generation_prompt=True adds the final <|assistant|> token.
            formatted_prompt = tokenizer.apply_chat_template(chat, tokenize=False, add_generation_prompt=True)
            logger.info("Successfully applied chat template.")
        except Exception as e:
            # Fallback for older transformers versions or models without a template
            logger.warning(f"Could not apply chat template: {e}. Using manual formatting as a fallback.")
            if conversation_history:
                formatted_prompt = ""
                for msg in conversation_history[-6:]: # Use last 3 exchanges
                    role = msg.get("role", "user")
                    content = msg.get("content", "")
                    if role == "user":
                        formatted_prompt += f"<|user|>\n{content}</s>\n"
                    elif role == "assistant":
                        formatted_prompt += f"<|assistant|>\n{content}</s>\n"
                formatted_prompt += f"<|user|>\n{args.prompt}</s>\n<|assistant|>\n"
            else:
                formatted_prompt = f"<|user|>\n{args.prompt}</s>\n<|assistant|>\n"

        logger.info(f"Formatted prompt length: {len(formatted_prompt)} chars")
        
        # Tokenize input
        inputs = tokenizer(formatted_prompt, return_tensors="pt")
        input_length = inputs["input_ids"].shape[1]
        
        if args.stream:
            # Streaming mode - output tokens one by one
            logger.info("Starting streaming generation...")
            
            for token_text in stream_generate(model, tokenizer, inputs, args.max_tokens, args.temperature):
                # Output each token as JSON to stdout
                output = {"token": token_text, "done": False}
                print(json.dumps(output), flush=True)
            
            # Signal completion
            print(json.dumps({"token": "", "done": True}), flush=True)
            logger.info("Streaming generation completed")
            
        else:
            # Non-streaming mode - generate complete response
            logger.info("Generating response...")
            outputs = model.generate(
                **inputs,
                max_new_tokens=args.max_tokens,
                temperature=args.temperature,
                do_sample=True,
                top_p=0.9,
            )
            
            # Decode only the generated part (exclude input)
            generated_ids = outputs[0][input_length:]
            response_text = tokenizer.decode(generated_ids, skip_special_tokens=True)
            
            # Output as JSON to stdout
            output = {"text": response_text, "done": True}
            print(json.dumps(output), flush=True)
            logger.info("Generation completed")
            
    except ImportError as e:
        logger.error("Failed to import Petals libraries. Make sure Petals is installed.")
        logger.error(f"Error: {e}")
        error_output = {"error": "Petals library not installed. Please install with: pip install git+https://github.com/bigscience-workshop/petals"}
        print(json.dumps(error_output), flush=True)
        sys.exit(1)
    except TimeoutError as e:
        logger.error(f"Timeout: {e}")
        error_output = {"error": str(e) + ". This usually means no one is hosting this model or the network is slow."}
        print(json.dumps(error_output), flush=True)
        sys.exit(1)
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Inference error: {error_msg}", exc_info=True)
        
        # Check for common Petals errors
        if "no blocks" in error_msg.lower() or "no servers" in error_msg.lower():
            error_output = {"error": f"No one is currently hosting this model. Please wait for someone to start sharing, or try a different model."}
        elif "timeout" in error_msg.lower():
            error_output = {"error": "Connection timed out. No one is hosting this model or network is slow."}
        else:
            error_output = {"error": error_msg}
        
        print(json.dumps(error_output), flush=True)
        sys.exit(1)

def stream_generate(model, tokenizer, inputs, max_new_tokens, temperature):
    
    input_ids = inputs["input_ids"]
    attention_mask = inputs.get("attention_mask")
    
    # Store the prompt's length and previous response length for diffing
    prompt_len = input_ids.shape[1] 
    previous_response_len = 0       
    
    for _ in range(max_new_tokens):
        # Get model predictions
        with torch.no_grad():
            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
            )
            logits = outputs.logits
        
        # Get next token (sample with temperature)
        next_token_logits = logits[:, -1, :] / temperature
        probs = torch.softmax(next_token_logits, dim=-1)
        next_token = torch.multinomial(probs, num_samples=1)
        
        # Check for EOS token
        if next_token.item() == tokenizer.eos_token_id:
            break
        
        # Append to input for next iteration
        input_ids = torch.cat([input_ids, next_token], dim=1)
        if attention_mask is not None:
            attention_mask = torch.cat([
                attention_mask,
                torch.ones((attention_mask.shape[0], 1), dtype=attention_mask.dtype)
            ], dim=1)
        
        # Decode the *entire* generated part (excluding the prompt)
        full_output_ids = input_ids[0, prompt_len:]
        
        # Decode the whole sequence generated so far
        full_response_text = tokenizer.decode(full_output_ids, skip_special_tokens=True)
        
        # Determine the *new* token text by taking the difference
        # This correctly captures spaces and special characters
        new_token_text = full_response_text[previous_response_len:]
        previous_response_len = len(full_response_text)
        
        # Only yield if there's actual text
        if new_token_text: 
            yield new_token_text
            
if __name__ == "__main__":
    main()

