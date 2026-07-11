// Mock data for DCVerse Dashboard


export const mockLanguages = [
  { id: 1, name: "English", code: "en" },
  { id: 2, name: "Hindi", code: "hi" },
  { id: 3, name: "Spanish", code: "es" },
  { id: 4, name: "French", code: "fr" },
  { id: 5, name: "German", code: "de" },
  { id: 6, name: "Mandarin", code: "zh" },
  { id: 7, name: "Japanese", code: "ja" },
  { id: 8, name: "Arabic", code: "ar" }
];

export const mockVoiceStyles = [
  { id: 1, name: "Natural" },
  { id: 2, name: "Expressive" },
  { id: 3, name: "Professional" },
  { id: 4, name: "Dramatic" },
  { id: 5, name: "Casual" }
];

export const mockVideoModels = [
  {
    id: 1,
    name: "Veo3",
    description: "Generate cinematic-quality videos with excellent motion consistency and visual appeal.",
    features: ["High-resolution output", "Stable motion", "Cinematic quality"],
    credits: "$3",
    recommended: true
  },
  {
    id: 2,
    name: "PikaLabs",
    description: "Fast generation time with unique artistic styles and effects.",
    features: ["Quick generation", "Artistic effects", "Multiple styles"],
    credits: "$2",
    recommended: false
  },
  {
    id: 3,
    name: "RunwayML",
    description: "Advanced AI video generation with professional-grade quality and customization options.",
    features: ["Professional quality", "Advanced controls", "Custom settings"],
    credits: "$4",
    recommended: false
  },
  {
    id: 4,
    name: "Sora",
    description: "OpenAI's revolutionary video model with unprecedented realism and temporal consistency.",
    features: ["Ultra-realistic output", "Perfect temporal flow", "Next-gen AI"],
    credits: "$4",
    recommended: true
  }
];

export const mockStoryboardFrames = [
  {
    id: 1,
    scene: "Opening Scene",
    description: "Character introduction in a urban setting",
    thumbnail: null,
    isGenerated: false,
    isLocked: false
  },
  {
    id: 2,
    scene: "Dialogue Scene",
    description: "Two characters in conversation",
    thumbnail: null,
    isGenerated: false,
    isLocked: false
  },
  {
    id: 3,
    scene: "Action Scene",
    description: "Dynamic movement sequence",
    thumbnail: null,
    isGenerated: false,
    isLocked: false
  },
  {
    id: 4,
    scene: "Closing Scene",
    description: "Final scene with emotional impact",
    thumbnail: null,
    isGenerated: false,
    isLocked: false
  },
  {
    id: 5,
    scene: "Transition",
    description: "Smooth transition between scenes",
    thumbnail: null,
    isGenerated: false,
    isLocked: false
  },
  {
    id: 6,
    scene: "Finale",
    description: "Epic conclusion",
    thumbnail: null,
    isGenerated: false,
    isLocked: false
  }
];

export const mockSelectedActors = [];

export const mockScript = "";

export const mockOutfitPresets = [
  { id: 1, name: "Casual", image: null },
  { id: 2, name: "Formal", image: null },
  { id: 3, name: "Traditional", image: null },
  { id: 4, name: "Modern", image: null }
];

// Utility functions for mock operations
export const mockFunctions = {
  uploadImage: (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setTimeout(() => resolve(e.target.result), 1000);
      };
      reader.readAsDataURL(file);
    });
  },
  
  generateStoryboard: (script) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          message: "Storyboard generated successfully!",
          frames: mockStoryboardFrames.map(frame => ({
            ...frame,
            isGenerated: true,
            thumbnail: `data:image/svg+xml;base64,${btoa('<svg width="200" height="120" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="120" fill="#1a1a1a"/><text x="100" y="60" text-anchor="middle" fill="white" font-size="12">' + frame.scene + '</text></svg>')}`
          }))
        });
      }, 2000);
    });
  },
  
  processVTON: (actorImage, outfitImage) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          processedImage: actorImage, // In real implementation, this would be the VTON result
          message: "Virtual try-on processed successfully!"
        });
      }, 3000);
    });
  },
  
  generateVideo: (config) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          videoUrl: "https://customer-assets.emergentagent.com/job_virtual-actor/artifacts/r3dkm2v5_TeraMeraPyar-Ai%20Salman.mp4",
          message: "Video generated successfully!"
        });
      }, 3000);
    });
  }
};