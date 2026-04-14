import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";

export default function SyncOverlay() {
  const [timestamp, setTimestamp] = useState(Date.now());

  useEffect(() => {
    // Update the QR code every 100ms
    const interval = setInterval(() => {
      setTimestamp(Date.now());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center">
      <QRCodeSVG value={timestamp.toString()} size={500} level="L" />
      <h1 className="text-black font-mono text-6xl font-black mt-8">
        POINT CAMERAS HERE
      </h1>
      <p className="text-zinc-500 font-mono text-2xl mt-4">{timestamp}</p>
    </div>
  );
}
