import React, { useState, useRef } from 'react';
import {
  Camera,
  X,
  Upload,
  Loader2,
  Image as ImageIcon,
  AlertCircle
} from 'lucide-react';
import { compressImageToMax1200px } from '../../utils/imageCompressor';

interface PhotoTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskTitle: string;
  taskDescription: string;
  onComplete: (photoBlob: Blob | File | string) => Promise<void>;
}

export const PhotoTaskModal: React.FC<PhotoTaskModalProps> = ({
  isOpen,
  onClose,
  taskTitle,
  taskDescription,
  onComplete,
}) => {
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [photoBlob, setPhotoBlob] = useState<Blob | File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    try {
      const compressed = await compressImageToMax1200px(file);
      setPhotoPreview(compressed.dataUrl);
      setPhotoBlob(compressed.blob);
    } catch {
      setErrorMsg('Fehler beim Komprimieren des Fotos (max. 1200px)');
    }
  };

  const handleSubmit = async () => {
    if (!photoBlob && !photoPreview) {
      setErrorMsg('Bitte nimm zuerst ein Foto auf oder wähle eines aus!');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await onComplete(photoBlob || photoPreview);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Fehler beim Hochladen der Aufgabe');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-md rounded-3xl bg-zinc-950 border border-zinc-800 p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#ff6b00]/20 text-[#ff6b00]">
              <Camera className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-white text-sm">Foto-Aufgabe lösen</h3>
              <p className="text-[11px] text-zinc-400">Aufgabe erfüllen & Foto in die Galerie laden</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-full text-zinc-400 hover:text-white bg-zinc-900 cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Task description */}
        <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
          <span className="text-[10px] font-black uppercase text-[#ff6b00] tracking-wider block">
            Deine Aufgabe:
          </span>
          <h4 className="font-bold text-white text-sm">{taskTitle}</h4>
          <p className="text-xs text-zinc-300 leading-relaxed">{taskDescription || taskTitle}</p>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {photoPreview ? (
            <div className="space-y-2">
              <div className="relative rounded-2xl overflow-hidden border border-zinc-700 bg-zinc-900 aspect-video flex items-center justify-center">
                <img src={photoPreview} alt="Aufgabenfoto" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setPhotoPreview('');
                    setPhotoBlob(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/75 text-white hover:bg-rose-950 transition cursor-pointer"
                  title="Anderes Foto wählen"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-emerald-400 font-semibold text-center">
                ✓ Foto bereit (automatisch auf 1200px optimiert)
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                {/* 1. Kamera aufnehmen */}
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="p-4 rounded-2xl border-2 border-dashed border-zinc-700 hover:border-[#ff6b00] bg-zinc-900/60 hover:bg-zinc-900 flex flex-col items-center justify-center text-center gap-2 cursor-pointer transition active:scale-95"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#ff6b00]/15 text-[#ff6b00] flex items-center justify-center">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">Kamera</span>
                    <span className="text-[10px] text-zinc-400">Jetzt knipsen</span>
                  </div>
                </button>

                {/* 2. Aus Galerie wählen */}
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="p-4 rounded-2xl border-2 border-dashed border-zinc-700 hover:border-purple-500 bg-zinc-900/60 hover:bg-zinc-900 flex flex-col items-center justify-center text-center gap-2 cursor-pointer transition active:scale-95"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">Galerie</span>
                    <span className="text-[10px] text-zinc-400">Aus Album wählen</span>
                  </div>
                </button>
              </div>

              {/* Hidden Inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoSelect}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoSelect}
              />

              <p className="text-[10px] text-zinc-500 text-center">
                Das Foto wird nach dem Absenden automatisch in der Party-Galerie veröffentlicht.
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-950/80 border border-rose-500 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Submit */}
        <div className="pt-2 border-t border-zinc-800 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white font-bold text-xs transition cursor-pointer"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || (!photoBlob && !photoPreview)}
            className="flex-2 py-3 rounded-2xl bg-gradient-to-r from-[#ff6b00] to-orange-600 hover:from-[#ff7c1f] hover:to-orange-500 text-zinc-950 font-black text-xs shadow-lg shadow-orange-950/50 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Wird gespeichert...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Foto absenden (+10 Pkt)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
