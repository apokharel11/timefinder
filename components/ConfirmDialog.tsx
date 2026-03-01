"use client";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ 
  isOpen, title, message, onConfirm, onCancel 
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3 className="modal-title">{title}</h3>
        <p className="modal-desc">{message}</p>
        <div className="modal-actions">
          <button className="btn-modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-modal-confirm" onClick={onConfirm}>
            Delete All
          </button>
        </div>
      </div>
    </div>
  );
}