"use client";

import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
import { Button } from "@/components/ui/button";
import { ArrowUp, Paperclip, Square, X } from "lucide-react";
import { useRef, useState } from "react";

type ChatPromptInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

export function ChatPromptInput({
  value,
  onChange,
  onSend,
  onStop,
  isLoading = false,
  disabled = false,
  placeholder = "Ask me anything...",
}: ChatPromptInputProps) {
  const [files, setFiles] = useState<File[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (value.trim() || files.length > 0) onSend();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFiles((prev) => [...prev, ...Array.from(event.target.files!)]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  };

  return (
    <PromptInput
      value={value}
      onValueChange={onChange}
      isLoading={isLoading}
      onSubmit={handleSubmit}
      disabled={disabled}
      className="w-full"
    >
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded-lg bg-secondary-container px-3 py-2 text-sm text-on-secondary-container"
              onClick={(event) => event.stopPropagation()}
            >
              <Paperclip className="size-4" />
              <span className="max-w-[120px] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => handleRemoveFile(index)}
                className="rounded-full p-1 hover:bg-on-secondary-container/10"
                aria-label={`Remove ${file.name}`}
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <PromptInputTextarea placeholder={placeholder} disabled={disabled} />

      <PromptInputActions className="flex items-center justify-between gap-2 pt-2">
        <PromptInputAction tooltip="Attach files">
          <label
            htmlFor="file-upload"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-2xl hover:bg-surface-container"
          >
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <Paperclip className="size-5 text-primary" />
          </label>
        </PromptInputAction>

        <PromptInputAction tooltip={isLoading ? "Stop generation" : "Send message"}>
          <Button
            variant="default"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={isLoading ? onStop : handleSubmit}
            aria-label={isLoading ? "Stop generation" : "Send message"}
          >
            {isLoading ? <Square className="size-5 fill-current" /> : <ArrowUp className="size-5" />}
          </Button>
        </PromptInputAction>
      </PromptInputActions>
    </PromptInput>
  );
}