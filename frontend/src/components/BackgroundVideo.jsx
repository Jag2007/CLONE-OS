import React from 'react';

const BackgroundVideo = ({ children, className = '',contentClass="" }) => {
  return (
    <div className={`relative min-h-screen overflow-hidden ${className}`}>
      {/* Video Background */}
      <div className="absolute inset-0 w-full h-full">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{
            filter: 'brightness(0.2) contrast(1.1)'
          }}
        >
          <source src="/herovideo.mp4" type="video/mp4" />
        </video>
      </div>
      
      {/* Content */}
      <div className={`relative z-10 container mx-auto ${contentClass}`}>
        {children}
      </div>
    </div>
  );
};

export default BackgroundVideo;
