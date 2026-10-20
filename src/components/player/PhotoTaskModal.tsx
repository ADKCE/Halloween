import React, { useState } from 'react';
import {
  Users,
  Search,
  Check,
  Camera,
  X,
  Upload,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Player, PhotoTaskTemplate } from '../../types/game';
import { compressImageToMax1200px } from '../../utils/imageCompressor';

interface PhotoTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskTitle: string;
  taskDescription: string;
  players: Player[];
  currentPlayerId: string;
  onComplete: (photoBlob: Blob | File | string, taggedPlayerIds: string[]) => Promise<void>;
}

export const PhotoTaskModal: React.FC<PhotoTaskModalProps> = ({
  isOpen,
  onClose,
  taskTitle,
  taskDescription,
  players,
  currentPlayerId,
  onComplete,
}) => {
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [photoBlob, setPhotoBlob] = useState<Blob | File | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  // Available co-players to tag (excluding self)
  const coPlayers = players.filter((p) => p.id !== currentPlayerId && p.status !== 'entfernt');

  const filteredCoPlayers = coPlayers.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.costumeName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const togglePlayerTag = (id: string) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]
    );
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToMax1200px(file);
      setPhotoPreview(compressed.dataUrl);
      setPhotoBlob(compressed.blob);
    } catch {
      setErrorMsg('Fehler beim Komprimieren des Fotos');
    }
  };

  const handleSubmit = async () => {
    if (!photoBlob && !photoPreview) {
      setErrorMsg('Bitte nimm zuerst ein Foto auf!');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await onComplete(photoBlob || photoPreview, selectedPlayerIds);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Fehler beim Hochladen der Aufgabe');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl bg-zinc-950 border border-zinc-800 p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#ff6b00]/20 text-[#ff6b00]">
              <Camera className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-white text-sm">Foto-Aufgabe lösen</h3>
              <p className="text-[11px] text-zinc-400">Verdiene 10 Pkt + 2 Pkt je markiertem Gast</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-white bg-zinc-900 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Task description */}
        <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800">
          <span className="text-[10px] font-black uppercase text-[#ff6b00] tracking-wider block">
            Deine Aufgabe:
          </span>
          <p className="text-xs font-medium text-zinc-200 mt-0.5">{taskDescription || taskTitle}</p>
        </div>

        {/* Content body scrollable */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* PHOTO UPLOAD / PREVIEW */}
          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1.5">
              1. Foto aufnehmen / hochladen:
            </label>
            {photoPreview ? (
              <div className="relative rounded-2xl overflow-hidden border border-zinc-700 bg-zinc-900 aspect-video flex items-center justify-center">
                <img src={photoPreview} alt="Aufgabenfoto" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setPhotoPreview('');
                    setPhotoBlob(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white hover:bg-black cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="border-2 border-dashed border-zinc-700 hover:border-[#ff6b00] rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition bg-zinc-900/50">
                <Upload className="w-8 h-8 text-[#ff6b00] mb-2" />
                <span className="text-xs font-bold text-white">Foto knipsen oder auswählen</span>
                <span className="text-[10px] text-zinc-400 mt-1">Kamera öffnet sich auf dem Smartphone</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
              </label>
            )}
          </div>

          {/* CO-PLAYER TAGGING */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-300">
                2. Mitspieler auf dem Foto markieren:
              </label>
              <span className="text-[10px] text-[#ff6b00] font-bold">
                {selectedPlayerIds.length} markiert (+{selectedPlayerIds.length * 2} Pkt)
              </span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Name oder Kostüm suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 outline-none focus:border-[#ff6b00]"
              />
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1 rounded-xl bg-zinc-900/60 p-1.5 border border-zinc-800">
              {filteredCoPlayers.length === 0 ? (
                <p className="text-[11px] text-zinc-500 text-center py-2">Keine Mitspieler gefunden</p>
              ) : (
                filteredCoPlayers.map((p) => {
                  const isSelected = selectedPlayerIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePlayerTag(p.id)}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition cursor-pointer ${
                        isSelected
                          ? 'bg-[#ff6b00]/20 border border-[#ff6b00]/60 text-white'
                          : 'bg-zinc-900 text-zinc-300 border border-transparent hover:bg-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <img
                          src={p.photoUrl || '/placeholder.png'}
                          alt={p.name}
                          className="w-6 h-6 rounded-full object-cover border border-zinc-700"
                        />
                        <div>
                          <div className="text-xs font-bold leading-tight">{p.name}</div>
                          <div className="text-[10px] text-zinc-400">{p.costumeName}</div>
                        </div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
                          isSelected
                            ? 'bg-[#ff6b00] border-[#ff6b00] text-zinc-950 font-bold'
                            : 'border-zinc-700 bg-zinc-950'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {errorMsg && (
          <p className="text-xs text-rose-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {errorMsg}
          </p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !photoPreview}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#ff6b00] to-orange-600 hover:from-[#ff7c1f] hover:to-orange-500 text-zinc-950 font-black text-xs shadow-lg shadow-orange-950 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
              Wird hochgeladen...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Aufgabe abschließen & Punkte kassieren
            </>
          )}
        </button>
      </div>
    </div>
  );
};
