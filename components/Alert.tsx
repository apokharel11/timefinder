"use client";

interface AlertProps {
  message: string;
  onClose: () => void;
}

export default function Alert({ message, onClose }: AlertProps) {
  if (!message) return null;

  return (
    <div className="alert-overlay">
      <div className="alert-content">{message}</div>
      <button className="alert-close" onClick={onClose}>X</button>
    </div>
  );
}