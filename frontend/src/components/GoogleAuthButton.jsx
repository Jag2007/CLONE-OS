import React, { useEffect, useRef, useState } from "react";

const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

export default function GoogleAuthButton({ onCredential, disabled = false }) {
  const buttonRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!googleClientId || !buttonRef.current) return undefined;

    const initializeGoogle = () => {
      if (!window.google?.accounts?.id || !buttonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          if (response?.credential) {
            onCredential(response.credential);
          }
        },
      });

      buttonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "filled_black",
        size: "large",
        shape: "rectangular",
        width: buttonRef.current.offsetWidth || 360,
        text: "continue_with",
      });
      setReady(true);
    };

    if (window.google?.accounts?.id) {
      initializeGoogle();
      return undefined;
    }

    const existingScript = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", initializeGoogle);
      return () => existingScript.removeEventListener("load", initializeGoogle);
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogle;
    document.body.appendChild(script);

    return () => {
      script.onload = null;
    };
  }, [onCredential]);

  if (!googleClientId) {
    return null;
  }

  return (
    <div className="google-auth-wrap" aria-busy={!ready || disabled}>
      <div
        ref={buttonRef}
        className={disabled ? "pointer-events-none opacity-60" : ""}
      />
    </div>
  );
}
