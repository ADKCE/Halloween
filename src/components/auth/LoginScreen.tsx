import React, { useState } from 'react';
import { Camera, Image as ImageIcon, Sparkles, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { compressImageToMax800px } from '../../utils/imageCompressor';

interface LoginScreenProps {
  onRegister: (playerData: { name: string; costumeName: string; photoUrl: string }) => Promise<void>;
  isLoading: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onRegister, isLoading }) => {
  const [name, setName] = useState('');
  const [costumeName, setCostumeName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    setIsCompressing(true);

    try {
      const compressedDataUrl = await compressImageToMax800px(file);
      setPhotoUrl(compressedDataUrl);
    } catch (err) {
      setErrorMsg('Fehler beim Laden des Fotos. Bitte erneut versuchen.');
    } finally {
      setIsCompressing(false);
    }
  };

  const isFormComplete = name.trim().length > 0 && costumeName.trim().length > 0 && photoUrl.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormComplete || isLoading || isCompressing) return;

    setErrorMsg('');
    try {
      await onRegister({
        name: name.trim(),
        costumeName: costumeName.trim(),
        photoUrl,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Registrierung fehlgeschlagen. Bitte prüfe deine Verbindung.');
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-[#09090b] via-[#1a0b2e] to-[#09090b] text-zinc-100 flex flex-col justify-between p-4 sm:p-6 max-w-md mx-auto">
      {/* Header Lockup */}
      <div className="pt-6 pb-4 text-center">
        <div className="inline-flex p-3 rounded-2xl bg-[#ff6b00]/15 border border-[#ff6b00]/30 text-[#ff6b00] shadow-lg shadow-[#ff6b00]/10 mb-3 animate-pulse">
          <Sparkles className="w-8 h-8" />
        </div>
        <h1 className="font-serif font-black text-2xl sm:text-3xl text-white tracking-wide uppercase drop-shadow-md">
          Halloween-Party
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          Tritt dem Spiel bei. Kein Passwort nötig!
        </p>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-center space-y-4 my-auto">
        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border border-rose-500/50 rounded-2xl text-xs text-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 1. Name */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-1.5">
            Dein Name <span className="text-[#ff6b00]">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Sarah Vogel"
            className="w-full px-4 py-3.5 rounded-2xl bg-zinc-950/80 border-2 border-zinc-800 text-white placeholder-zinc-500 text-base font-semibold focus:outline-none focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20 transition"
          />
        </div>

        {/* 2. Kostümname */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-1.5">
            Kostümname <span className="text-[#ff6b00]">*</span>
          </label>
          <input
            type="text"
            required
            value={costumeName}
            onChange={(e) => setCostumeName(e.target.value)}
            placeholder="z.B. Gräfin Dracula, Zombie-Braut"
            className="w-full px-4 py-3.5 rounded-2xl bg-zinc-950/80 border-2 border-zinc-800 text-white placeholder-zinc-500 text-base font-semibold focus:outline-none focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20 transition"
          />
        </div>

        {/* 3. Kostümfoto (Camera or Gallery) */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-1.5">
            Kostümfoto aufnehmen <span className="text-[#ff6b00]">*</span>
          </label>

          {photoUrl ? (
            <div className="relative aspect-4/3 w-full rounded-2xl overflow-hidden border-2 border-[#ff6b00] shadow-lg shadow-[#ff6b00]/20 bg-black">
              <img src={photoUrl} alt="Kostümvorschau" className="w-full h-full object-cover" />
              <label className="absolute bottom-2 right-2 px-3 py-1.5 rounded-xl bg-black/80 backdrop-blur-md text-xs font-bold text-white border border-zinc-700 flex items-center gap-1.5 cursor-pointer">
                <Camera className="w-3.5 h-3.5 text-[#ff6b00]" />
                Foto ändern
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {/* Direct Camera Button */}
              <label className="flex flex-col items-center justify-center p-4 rounded-2xl bg-zinc-950/80 border-2 border-dashed border-zinc-800 hover:border-[#ff6b00] text-zinc-300 cursor-pointer transition active:scale-95 min-h-[110px]">
                {isCompressing ? (
                  <Loader2 className="w-7 h-7 text-[#ff6b00] animate-spin" />
                ) : (
                  <>
                    <Camera className="w-7 h-7 text-[#ff6b00] mb-1.5" />
                    <span className="text-xs font-bold">Kamera</span>
                    <span className="text-[10px] text-zinc-500">Direkt knipsen</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handleImageSelect}
                  disabled={isCompressing}
                  className="hidden"
                />
              </label>

              {/* Gallery Pick Button */}
              <label className="flex flex-col items-center justify-center p-4 rounded-2xl bg-zinc-950/80 border-2 border-dashed border-zinc-800 hover:border-[#ff6b00] text-zinc-300 cursor-pointer transition active:scale-95 min-h-[110px]">
                {isCompressing ? (
                  <Loader2 className="w-7 h-7 text-[#ff6b00] animate-spin" />
                ) : (
                  <>
                    <ImageIcon className="w-7 h-7 text-purple-400 mb-1.5" />
                    <span className="text-xs font-bold">Galerie</span>
                    <span className="text-[10px] text-zinc-500">Aus Album wählen</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  disabled={isCompressing}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={!isFormComplete || isLoading || isCompressing}
            className={`w-full py-4 px-6 rounded-2xl font-serif font-black text-base uppercase tracking-wider transition shadow-xl flex items-center justify-center gap-2 cursor-pointer ${
              !isFormComplete || isLoading || isCompressing
                ? 'bg-zinc-800 text-zinc-500 border border-zinc-700/50 cursor-not-allowed opacity-60'
                : 'bg-linear-to-r from-[#ff6b00] to-rose-600 hover:from-[#ff6b00] hover:to-rose-500 text-white shadow-[#ff6b00]/25 active:scale-98'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Beitritt läuft...
              </>
            ) : (
              <>
                <span>Der Party beitreten</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Footer Notice */}
      <div className="pt-4 pb-2 text-center text-[11px] text-zinc-500">
        Alle 3 Angaben sind Pflicht. Dein Gerät merkt sich deinen Login automatisch.
      </div>
    </div>
  );
};
