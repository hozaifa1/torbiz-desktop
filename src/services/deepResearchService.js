import api from "./api";

/**
 * Deep Research Service
 * Handles creating, retrieving, and regenerating deep research queries with streaming responses
 */

/**
 * Stream a deep research query and get AI response
 * @param {number} clientId - The client ID making the request
 * @param {string} questionText - The research question
 * @param {File|null} imageFile - Optional image file to include
 * @param {Function} onToken - Callback for each token received
 * @param {Function} onComplete - Callback when stream completes
 * @param {Function} onError - Callback for errors
 * @returns {Function} Abort function to cancel the stream
 */
export const streamDeepResearch = async (
  clientId,
  questionText,
  imageFile,
  onToken,
  onComplete,
  onError
) => {
  let aborted = false;

  try {
    // Prepare form data if image is provided
    const formData = new FormData();
    formData.append("client", clientId);
    formData.append("question_text", questionText);
    if (imageFile) {
      formData.append("image", imageFile);
    }

    const config = {
      headers: {
        "Content-Type": imageFile ? "multipart/form-data" : "application/json",
      },
      responseType: "text",
      onDownloadProgress: (progressEvent) => {
        if (aborted) return;

        const text = progressEvent.event.target.responseText;
        if (!text) return;

        // Parse streaming response - backend sends chunks
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.trim() && !aborted) {
            try {
              onToken(line);
            } catch (err) {
              console.error("[DEEP-RESEARCH] Token processing error:", err);
            }
          }
        }
      },
    };

    // Make the request
    const requestBody = imageFile ? formData : { client: clientId, question_text: questionText };
    
    await api.post("/deepresearch/", requestBody, config);

    if (!aborted) {
      onComplete();
    }
  } catch (error) {
    if (!aborted) {
      console.error("[DEEP-RESEARCH] Stream error:", error);
      onError(error.response?.data?.detail || error.message || "Failed to perform deep research");
    }
  }

  // Return abort function
  return () => {
    aborted = true;
    console.log("[DEEP-RESEARCH] Stream aborted");
  };
};

/**
 * Create a non-streaming deep research entry
 * @param {number} clientId - The client ID
 * @param {string} questionText - The research question
 * @param {File|null} imageFile - Optional image file
 * @returns {Promise} Response data
 */
export const createDeepResearch = async (clientId, questionText, imageFile = null) => {
  try {
    const formData = new FormData();
    formData.append("client", clientId);
    formData.append("question_text", questionText);
    if (imageFile) {
      formData.append("image", imageFile);
    }

    const config = {
      headers: {
        "Content-Type": imageFile ? "multipart/form-data" : "application/json",
      },
    };

    const requestBody = imageFile ? formData : { client: clientId, question_text: questionText };
    const response = await api.post("/deepresearch/", requestBody, config);
    return response.data;
  } catch (error) {
    console.error("[DEEP-RESEARCH] Create error:", error);
    throw error;
  }
};

/**
 * Get all deep research entries
 * @returns {Promise} Array of deep research entries
 */
export const getAllDeepResearch = async () => {
  try {
    const response = await api.get("/deepresearch/");
    return response.data;
  } catch (error) {
    console.error("[DEEP-RESEARCH] Fetch all error:", error);
    throw error;
  }
};

/**
 * Get deep research entries for a specific client
 * @param {number} clientId - The client ID
 * @returns {Promise} Array of deep research entries
 */
export const getDeepResearchByClient = async (clientId) => {
  try {
    const response = await api.get("/deepresearch/by_client/", {
      params: { client: clientId },
    });
    return response.data;
  } catch (error) {
    console.error("[DEEP-RESEARCH] Fetch by client error:", error);
    throw error;
  }
};

/**
 * Get a specific deep research entry by ID
 * @param {number} researchId - The research ID
 * @returns {Promise} Deep research entry
 */
export const getDeepResearchById = async (researchId) => {
  try {
    const response = await api.get(`/deepresearch/${researchId}/`);
    return response.data;
  } catch (error) {
    console.error("[DEEP-RESEARCH] Fetch by ID error:", error);
    throw error;
  }
};

/**
 * Regenerate answer for an existing deep research entry
 * @param {number} researchId - The research ID
 * @param {Function} onToken - Callback for each token
 * @param {Function} onComplete - Callback on completion
 * @param {Function} onError - Callback on error
 * @returns {Function} Abort function
 */
export const regenerateDeepResearch = async (
  researchId,
  onToken,
  onComplete,
  onError
) => {
  let aborted = false;

  try {
    const config = {
      responseType: "text",
      onDownloadProgress: (progressEvent) => {
        if (aborted) return;

        const text = progressEvent.event.target.responseText;
        if (!text) return;

        const lines = text.split("\n");
        for (const line of lines) {
          if (line.trim() && !aborted) {
            try {
              onToken(line);
            } catch (err) {
              console.error("[DEEP-RESEARCH] Regenerate token error:", err);
            }
          }
        }
      },
    };

    await api.post(`/deepresearch/${researchId}/regenerate/`, {}, config);

    if (!aborted) {
      onComplete();
    }
  } catch (error) {
    if (!aborted) {
      console.error("[DEEP-RESEARCH] Regenerate error:", error);
      onError(error.response?.data?.detail || error.message || "Failed to regenerate research");
    }
  }

  return () => {
    aborted = true;
    console.log("[DEEP-RESEARCH] Regenerate aborted");
  };
};

/**
 * Delete a deep research entry
 * @param {number} researchId - The research ID to delete
 * @returns {Promise}
 */
export const deleteDeepResearch = async (researchId) => {
  try {
    await api.delete(`/deepresearch/${researchId}/`);
    return true;
  } catch (error) {
    console.error("[DEEP-RESEARCH] Delete error:", error);
    throw error;
  }
};
