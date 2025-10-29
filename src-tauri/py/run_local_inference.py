#!/usr/bin/env python3
"""
Local inference script using HuggingFace transformers directly
Bypasses Petals network for testing purposes
"""
import sys
import logging
import argparse
import json
import torch

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)]
)
logger = logging.getLogger(__name__)

def main():
    parser = argparse.ArgumentParser(description="Run local inference using HuggingFace transformers")
    parser.add_argument("--model-name", type=str, default="TinyLlama/TinyLlama-1.1B-Chat-v1.0",
                        help="HuggingFace model name/ID")
    parser.add_argument("--prompt", type=str, required=True,
                        help="The prompt/question text")
    parser.add_argument("--max-tokens", type=int, default=512,
                        help="Maximum tokens to generate")
    parser.add_argument("--temperature", type=float, default=0.7,
                        help="Sampling temperature")
    parser.add_argument("--stream", action="store_true",
                        help="Stream tokens one by one")
    parser.add_argument("--conversation-history", type=str, default="[]",
                        help="JSON array of previous messages for context")
    args = parser.parse_args()
    
    try:
        # Import transformers
        logger.info(f"Loading model: {args.model_name}")
        print(json.dumps({"status": "loading_model", "message": "Loading model..."}), flush=True)
        
        from transformers import AutoModelForCausalLM, AutoTokenizer
        
        # Load tokenizer and model
        logger.info("Loading tokenizer...")
        print(json.dumps({"status": "loading_tokenizer", "message": "Loading tokenizer..."}), flush=True)
        
        tokenizer = AutoTokenizer.from_pretrained(args.model_name)
        
        # Set pad token if not set
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
        
        print(json.dumps({"status": "tokenizer_loaded", "message": "Tokenizer loaded"}), flush=True)
        
        logger.info("Loading model from HuggingFace...")
        print(json.dumps({"status": "loading_weights", "message": "Loading model weights..."}), flush=True)
        
        # Load model with appropriate device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {device}")
        
        model = AutoModelForCausalLM.from_pretrained(
            args.model_name,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            device_map="auto" if device == "cuda" else None,
            low_cpu_mem_usage=True
        )
        
        if device == "cpu":
            model = model.to(device)
        
        print(json.dumps({"status": "model_loaded", "message": f"Model loaded on {device}"}), flush=True)
        logger.info("Model loaded successfully")
        
        # Parse conversation history
        try:
            conversation_history = json.loads(args.conversation_history)
        except:
            conversation_history = []
        
        # Build prompt with conversation context
        if conversation_history:
            # Format: alternating user/assistant messages
            formatted_prompt = ""
            for msg in conversation_history[-6:]:  # Last 3 exchanges (6 messages)
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role == "user":
                    formatted_prompt += f"<|user|>\n{content}</s>\n"
                elif role == "assistant":
                    formatted_prompt += f"<|assistant|>\n{content}</s>\n"
            
            # Add current prompt
            formatted_prompt += f"<|user|>\n{args.prompt}</s>\n<|assistant|>\n"
        else:
            # Simple format for first message
            formatted_prompt = f"<|user|>\n{args.prompt}</s>\n<|assistant|>\n"
        
        logger.info(f"Formatted prompt length: {len(formatted_prompt)} chars")
        
        # Tokenize input
        inputs = tokenizer(formatted_prompt, return_tensors="pt", padding=True, truncation=True, max_length=2048)
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        input_length = inputs["input_ids"].shape[1]
        logger.info(f"Input tokens: {input_length}")
        
        if args.stream:
            # Streaming mode with proper termination
            logger.info("Starting streaming generation...")
            print(json.dumps({"status": "generating", "message": "Generating response..."}), flush=True)
            
            generated_tokens = 0
            stopped_by_eos = False
            
            with torch.no_grad():
                for _ in range(args.max_tokens):
                    # Generate next token
                    outputs = model(**inputs)
                    next_token_logits = outputs.logits[:, -1, :] / args.temperature
                    
                    # Sample next token
                    probs = torch.softmax(next_token_logits, dim=-1)
                    next_token = torch.multinomial(probs, num_samples=1)
                    
                    # Check for EOS token - CRITICAL FOR STOPPING
                    if next_token.item() == tokenizer.eos_token_id:
                        logger.info(f"EOS token detected at position {generated_tokens}")
                        stopped_by_eos = True
                        break
                    
                    # Decode and output the token
                    token_text = tokenizer.decode(next_token[0], skip_special_tokens=True)
                    
                    # Output token
                    if token_text:
                        output = {"token": token_text, "done": False}
                        print(json.dumps(output), flush=True)
                        generated_tokens += 1
                    
                    # Append token to input for next iteration
                    inputs["input_ids"] = torch.cat([inputs["input_ids"], next_token], dim=1)
                    if "attention_mask" in inputs:
                        inputs["attention_mask"] = torch.cat([
                            inputs["attention_mask"],
                            torch.ones((inputs["attention_mask"].shape[0], 1), device=device, dtype=inputs["attention_mask"].dtype)
                        ], dim=1)
                    
                    # Safety check: stop if response is too long
                    if generated_tokens >= args.max_tokens:
                        logger.info(f"Reached max tokens: {args.max_tokens}")
                        break
            
            # Signal completion with reason
            completion_reason = "eos" if stopped_by_eos else "length"
            print(json.dumps({"token": "", "done": True, "reason": completion_reason}), flush=True)
            logger.info(f"Streaming generation completed ({completion_reason}). Generated {generated_tokens} tokens")
            
        else:
            # Non-streaming mode
            logger.info("Generating response (non-streaming)...")
            
            with torch.no_grad():
                outputs = model.generate(
                    **inputs,
                    max_new_tokens=args.max_tokens,
                    temperature=args.temperature,
                    do_sample=True,
                    top_p=0.9,
                    pad_token_id=tokenizer.eos_token_id,
                    eos_token_id=tokenizer.eos_token_id
                )
            
            # Decode only the generated part (exclude input)
            generated_ids = outputs[0][input_length:]
            response_text = tokenizer.decode(generated_ids, skip_special_tokens=True)
            
            # Output as JSON
            output = {"text": response_text, "done": True}
            print(json.dumps(output), flush=True)
            logger.info("Generation completed")
            
    except ImportError as e:
        logger.error("Failed to import transformers. Make sure transformers and torch are installed.")
        logger.error(f"Error: {e}")
        error_output = {"error": "transformers library not installed. Please install with: pip install transformers torch"}
        print(json.dumps(error_output), flush=True)
        sys.exit(1)
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Inference error: {error_msg}", exc_info=True)
        error_output = {"error": error_msg}
        print(json.dumps(error_output), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()

