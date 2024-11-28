import { GoogleGenerativeAI } from "@google/generative-ai";
import md from "markdown-it";

// Configuration and environment setup
const API_KEY = import.meta.env.VITE_API_KEY;
if (!API_KEY) {
  console.error(
    "Missing Google AI API key. Please set VITE_API_KEY in your environment."
  );
}

// Initialize the Google AI client
const genAI = new GoogleGenerativeAI(API_KEY);
const textModel = genAI.getGenerativeModel({ model: "gemini-pro" });

// Conversation state
let conversationHistory = [];

// Image utility functions
async function convertImageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

async function resizeImage(file, maxWidth = 300, maxHeight = 300) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Maintain aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          resolve(blob);
        }, file.type);
      };
      img.onerror = (error) => reject(error);
      img.src = event.target.result;
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

// UI Rendering Helpers
function createUserDiv(message, imageUrl = null) {
  const imageHtml = imageUrl
    ? `
    <div class="flex gap-2 justify-end">
      <img src="${imageUrl}" alt="Uploaded image" class="max-w-48 max-h-48 rounded-md" />
    </div>`
    : "";
  return `
    <div class="flex items-center gap-2 justify-end">
      <p class="bg-gemDeep text-white p-1 rounded-md-user shadow-md">
        ${message || ""}
      </p>
      <img src="/user.svg" alt="User profile picture" class="w-10 h-10 rounded-full" />
    </div>
    ${imageHtml}
  `;
}

function createAIDiv(message) {
  return `
    <div class="flex gap-2 justify-start">
      <img src="/bot.svg" alt="AI bot icon" class="w-10 h-10" />
      <pre class="bg-gemRegular/40 text-gemDeep p-1 rounded-md-ai shadow-md whitespace-pre-wrap">
        ${message}
      </pre>
    </div>
  `;
}

// AI Response Handler
async function getAIResponse(prompt, imageFile = null) {
  try {
    let result;
    if (imageFile) {
      // Image + text prompt using the latest model
      const imageBase64 = await convertImageToBase64(imageFile);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      result = await model.generateContent([
        prompt || "Describe this image in detail",
        {
          inlineData: {
            mimeType: imageFile.type,
            data: imageBase64.split(",")[1],
          },
        },
      ]);
    } else {
      // Text-only prompt
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      result = await model.generateContent(prompt);
    }

    const response = await result.response;
    const text = response.text();

    // Optional: Update conversation history
    if (prompt) {
      conversationHistory.push({
        role: "user",
        parts: [{ text: prompt }],
      });
      conversationHistory.push({
        role: "model",
        parts: [{ text: text }],
      });
    }

    return text;
  } catch (error) {
    console.error("AI Response Error:", error);

    // More detailed error handling
    if (error.message.includes("deprecated")) {
      return "I'm sorry, but the image analysis model is currently unavailable. Please try again with a text-only prompt.";
    }

    return "Sorry, I encountered an error processing your request.";
  }
}

// UI Interaction Handlers
async function handleChatSubmit(event) {
  event.preventDefault();

  const promptInput = document.getElementById("prompt");
  const chatContainer = document.getElementById("chat-container");
  const imageUpload = document.getElementById("image-upload");

  const prompt = promptInput.value.trim();
  let imageFile = null;
  let imageUrl = null;

  if (prompt === "" && !imageUpload.files.length) {
    return;
  }

  // Handle image upload
  if (imageUpload.files.length) {
    try {
      const resizedBlob = await resizeImage(imageUpload.files[0]);
      imageFile = new File([resizedBlob], imageUpload.files[0].name, {
        type: imageUpload.files[0].type,
      });
      imageUrl = URL.createObjectURL(imageFile);
    } catch (error) {
      console.error("Image processing error:", error);
    }
  }

  // Render user message and image
  chatContainer.innerHTML += createUserDiv(prompt, imageUrl);

  // Reset inputs
  promptInput.value = "";
  imageUpload.value = "";

  // Show typing indicator
  showTypingIndicator();

  try {
    // Get AI response
    const aiResponse = await getAIResponse(prompt, imageFile);

    // Render AI response with markdown
    const renderedResponse = md().render(aiResponse);
    chatContainer.innerHTML += createAIDiv(renderedResponse);
  } catch (error) {
    console.error("Chat submission error:", error);
    chatContainer.innerHTML += createAIDiv("Sorry, something went wrong.");
  } finally {
    hideTypingIndicator();
  }
}

// Typing Indicator Functions
function showTypingIndicator() {
  const typingIndicator = document.getElementById("typing-indicator");
  const submitIndicator = document.getElementById("submit-indicator");

  if (typingIndicator && submitIndicator) {
    typingIndicator.style.display = "block";
    submitIndicator.style.display = "none";
  }
}

function hideTypingIndicator() {
  const typingIndicator = document.getElementById("typing-indicator");
  const submitIndicator = document.getElementById("submit-indicator");

  if (typingIndicator && submitIndicator) {
    typingIndicator.style.display = "none";
    submitIndicator.style.display = "block";
  }
}

// Fullscreen Toggle
function toggleFullScreen() {
  const mainElement = document.querySelector("main");

  if (!document.fullscreenElement) {
    if (mainElement.requestFullscreen) mainElement.requestFullscreen();
    else if (mainElement.mozRequestFullScreen)
      mainElement.mozRequestFullScreen();
    else if (mainElement.webkitRequestFullscreen)
      mainElement.webkitRequestFullscreen();
    else if (mainElement.msRequestFullscreen) mainElement.msRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  }
}

// Initialize Event Listeners
function initializeApp() {
  const chatForm = document.getElementById("chat-form");
  const imageUpload = document.getElementById("image-upload");

  if (chatForm) {
    chatForm.addEventListener("submit", handleChatSubmit);
    chatForm.addEventListener("keyup", (event) => {
      if (event.key === "Enter") handleChatSubmit(event);
    });
  }

  // Image Upload Button
  const imageUploadBtn = document.createElement("button");
  imageUploadBtn.innerHTML = '<i class="fas fa-image"></i>';
  imageUploadBtn.classList.add(
    "p-2",
    "text-gemDeep",
    "hover:bg-gemLight",
    "rounded-md",
    "mr-2"
  );
  imageUploadBtn.setAttribute("type", "button");
  imageUploadBtn.setAttribute("title", "Upload Image");

  imageUploadBtn.addEventListener("click", () => {
    imageUpload.click();
  });

  imageUpload.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
      console.log("Image selected:", file.name);
    }
  });

  // Add buttons to form
  if (chatForm) {
    chatForm.insertBefore(imageUploadBtn, chatForm.lastElementChild);
  }

  // Expose global methods
  window.toggleFullScreen = toggleFullScreen;
}

// Initialize on DOM load
document.addEventListener("DOMContentLoaded", initializeApp);

export { handleChatSubmit, toggleFullScreen };
