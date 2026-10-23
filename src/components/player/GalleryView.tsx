import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  User,
  Camera,
  Archive,
  Loader2,
  Lock,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { PartyPhoto } from '../../types/game';
import { downloadSinglePhoto, downloadPhotosAsZip } from '../../utils/zipDownloader';

interface GalleryViewProps {
  photos: PartyPhoto[];
  currentPlayerId: string;
  currentPlayerName?: string;
  isGameEnded: boolean;
  downloadSetting: 'ended' | 'always';
  isAdmin?: boolean;
  onDeletePhoto: (photoId: string) => Promise<void>;
}

export const GalleryView: React.FC<GalleryViewProps> = ({
  photos,
  currentPlayerId,
  currentPlayerName,
  isGameEnded,
  downloadSetting,
  isAdmin = false,
  onDeletePhoto,
}) => {
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  // Check if download is unlocked for normal players:
  // Unlocked if admin, OR setting is 'always', OR game has ended
  const isDownloadUnlocked = isAdmin || downloadSetting === 'always' || isGameEnded;

  // Filtered photos (newest first)
  const filteredPhotos = useMemo(() => {
    const list = [...photos].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (filter === 'mine') {
      return list.filter((p) => p.playerId === currentPlayerId);
    }
    return list;
  }, [photos, filter, currentPlayerId]);

  const myPhotosCount = useMemo(() => {
    return photos.filter((p) => p.playerId === currentPlayerId).length;
  }, [photos, currentPlayerId]);

  // Handle single photo download
  const handleDownloadSingle = async (e: React.MouseEvent, photo: PartyPhoto) => {
    e.stopPropagation();
    const taskName = (photo.taskTitle || photo.caption || 'Foto').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeName = (photo.photographerName || 'Gast').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Halloween_${safeName}_${taskName}.jpg`;
    await downloadSinglePhoto(photo.photoUrl, filename);
  };

  // Handle ZIP download of visible/filtered photos
  const handleDownloadZip = async () => {
    if (!isDownloadUnlocked) return;
    const targets = filter === 'mine'
      ? photos.filter((p) => p.playerId === currentPlayerId)
      : photos;

    if (targets.length === 0) return;

    setIsZipping(true);
    setZipProgress({ current: 0, total: targets.length });

    const zipName = filter === 'mine'
      ? `Halloween_Fotos_${(currentPlayerName || 'Meine').replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`
      : 'Halloween_Party_Alle_Fotos.zip';

    try {
      await downloadPhotosAsZip(
        targets.map((p) => ({
          id: p.id,
          photoUrl: p.photoUrl,
          photographerName: p.photographerName,
          taskTitle: p.taskTitle || p.caption,
          createdAt: p.createdAt,
        })),
        zipName,
        (current, total) => setZipProgress({ current, total })
      );
    } catch (err) {
      console.error('ZIP-Erstellung fehlgeschlagen:', err);
    } finally {
      setIsZipping(false);
      setZipProgress(null);
    }
  };

  // Handle photo deletion
  const handleDelete = async (e: React.MouseEvent, photoId: string) => {
    e.stopPropagation();
    if (!confirm('Möchtest du dieses Foto wirklich unwiderruflich aus der Galerie löschen?')) {
      return;
    }
    setDeletingPhotoId(photoId);
    try {
      await onDeletePhoto(photoId);
      if (lightboxIndex !== null) {
        setLightboxIndex(null);
      }
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Löschen des Fotos');
    } finally {
      setDeletingPhotoId(null);
    }
  };

  // Lightbox Navigation
  const handlePrev = useCallback(() => {
    if (lightboxIndex === null) return;
    setLightboxIndex((prev) => (prev! > 0 ? prev! - 1 : filteredPhotos.length - 1));
  }, [lightboxIndex, filteredPhotos.length]);

  const handleNext = useCallback(() => {
    if (lightboxIndex === null) return;
    setLightboxIndex((prev) => (prev! < filteredPhotos.length - 1 ? prev! + 1 : 0));
  }, [lightboxIndex, filteredPhotos.length]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') setLightboxIndex(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, handlePrev, handleNext]);

  // Touch Swipe navigation for mobile
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (diff > 50) {
      // Swiped left -> next
      handleNext();
    } else if (diff < -50) {
      // Swiped right -> prev
      handlePrev();
    }
    setTouchStartX(null);
  };

  const activeLightboxPhoto = lightboxIndex !== null ? filteredPhotos[lightboxIndex] : null;

  return (
    <div className="space-y-4 animate-in fade-in pb-12">
      {/* Header bar with total counter and ZIP download */}
      <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-purple-950/80 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif font-black text-white text-base">Party-Galerie</h3>
              <p className="text-[11px] text-zinc-400">
                {photos.length} {photos.length === 1 ? 'Foto' : 'Fotos'} aus Aufgaben
              </p>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex rounded-xl bg-zinc-950 p-1 border border-zinc-800 text-xs font-bold">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                filter === 'all'
                  ? 'bg-purple-600 text-white font-black shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Alle ({photos.length})
            </button>
            <button
              onClick={() => setFilter('mine')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                filter === 'mine'
                  ? 'bg-purple-600 text-white font-black shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Meine ({myPhotosCount})
            </button>
          </div>
        </div>

        {/* ZIP Download Bar */}
        <div className="pt-2 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-[11px] text-zinc-400">
            {isDownloadUnlocked ? (
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Download freigeschaltet
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-zinc-500">
                <Lock className="w-3.5 h-3.5" />
                Download wird bei Spielende freigeschaltet
              </span>
            )}
          </div>

          <button
            onClick={handleDownloadZip}
            disabled={!isDownloadUnlocked || isZipping || filteredPhotos.length === 0}
            className="px-3.5 py-2 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-500/40 text-purple-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isZipping ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                <span>
                  Packe ZIP ({zipProgress?.current}/{zipProgress?.total})...
                </span>
              </>
            ) : (
              <>
                <Archive className="w-4 h-4 text-purple-400" />
                <span>
                  {filter === 'mine' ? 'Meine Fotos als ZIP' : 'Alle Fotos als ZIP'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* PHOTO GRID */}
      {filteredPhotos.length === 0 ? (
        <div className="p-8 rounded-3xl bg-zinc-900 border border-zinc-800 text-center space-y-2">
          <Camera className="w-10 h-10 mx-auto text-zinc-600 animate-pulse" />
          <h4 className="font-bold text-white text-sm">
            {filter === 'mine' ? 'Du hast noch keine Fotos hochgeladen' : 'Noch keine Fotos in der Galerie'}
          </h4>
          <p className="text-xs text-zinc-400 max-w-xs mx-auto">
            {filter === 'mine'
              ? 'Löse eine Foto-Aufgabe im Tab "Aufgaben", um dein erstes Bild hier zu sehen!'
              : 'Sobald Spieler Foto-Aufgaben lösen, erscheinen ihre Schnappschüsse automatisch hier.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {filteredPhotos.map((ph, idx) => {
            const isOwn = ph.playerId === currentPlayerId;
            const canDelete = isOwn || isAdmin;
            const timeStr = ph.createdAt
              ? new Date(ph.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '';

            return (
              <div
                key={ph.id}
                onClick={() => setLightboxIndex(idx)}
                className="group relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900 aspect-square cursor-pointer hover:border-purple-500/60 transition shadow-md"
              >
                {/* Lazy-loaded photo */}
                <img
                  src={ph.photoUrl}
                  alt={ph.taskTitle || 'Party-Foto'}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />

                {/* Top Action Icons (Delete & Single Download) */}
                <div className="absolute top-1.5 right-1.5 flex items-center gap-1 z-10">
                  {isDownloadUnlocked && (
                    <button
                      type="button"
                      onClick={(e) => handleDownloadSingle(e, ph)}
                      className="p-1.5 rounded-xl bg-black/60 hover:bg-purple-600 text-white backdrop-blur-md transition cursor-pointer"
                      title="Foto herunterladen"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {canDelete && (
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, ph.id)}
                      disabled={deletingPhotoId === ph.id}
                      className="p-1.5 rounded-xl bg-black/60 hover:bg-rose-600 text-rose-300 hover:text-white backdrop-blur-md transition cursor-pointer"
                      title="Foto löschen"
                    >
                      {deletingPhotoId === ph.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                {/* Bottom Metadata Overlay: Task, Time, Photographer (NO ROLES!) */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent p-2 text-left space-y-0.5">
                  <span className="text-[11px] font-bold text-white block truncate leading-tight">
                    {ph.taskTitle || ph.caption || 'Foto-Aufgabe'}
                  </span>
                  <div className="flex items-center justify-between text-[10px] text-zinc-300">
                    <span className="truncate max-w-[95px] font-medium text-purple-300">
                      {ph.photographerName || 'Gast'}
                    </span>
                    {timeStr && <span className="font-mono text-zinc-400 shrink-0">{timeStr}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FULLSCREEN LIGHTBOX MODAL WITH SWIPE / ARROWS */}
      {activeLightboxPhoto && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black/95 backdrop-blur-xl p-4 animate-in fade-in"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Lightbox Top Header */}
          <div className="w-full max-w-lg flex items-center justify-between text-white py-2 z-10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-400">
                {lightboxIndex + 1} / {filteredPhotos.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isDownloadUnlocked && (
                <button
                  onClick={(e) => handleDownloadSingle(e, activeLightboxPhoto)}
                  className="p-2 rounded-xl bg-zinc-900/80 hover:bg-purple-600 text-white transition cursor-pointer"
                  title="Foto herunterladen"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
              {(activeLightboxPhoto.playerId === currentPlayerId || isAdmin) && (
                <button
                  onClick={(e) => handleDelete(e, activeLightboxPhoto.id)}
                  disabled={deletingPhotoId === activeLightboxPhoto.id}
                  className="p-2 rounded-xl bg-zinc-900/80 hover:bg-rose-600 text-rose-400 hover:text-white transition cursor-pointer"
                  title="Foto löschen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setLightboxIndex(null)}
                className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Photo Container with navigation arrows */}
          <div className="relative flex-1 w-full max-w-lg flex items-center justify-center my-auto">
            {/* Left arrow */}
            <button
              onClick={handlePrev}
              className="absolute left-1 z-20 p-2.5 rounded-full bg-black/60 hover:bg-purple-600 text-white backdrop-blur-md transition cursor-pointer"
              title="Vorheriges Foto"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* High-res Image */}
            <img
              src={activeLightboxPhoto.photoUrl}
              alt={activeLightboxPhoto.taskTitle || 'Party-Foto'}
              className="max-h-[68vh] max-w-full rounded-2xl object-contain shadow-2xl border border-zinc-800"
            />

            {/* Right arrow */}
            <button
              onClick={handleNext}
              className="absolute right-1 z-20 p-2.5 rounded-full bg-black/60 hover:bg-purple-600 text-white backdrop-blur-md transition cursor-pointer"
              title="Nächstes Foto"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          {/* Lightbox Bottom Metadata: Aufgabe, Uhrzeit, Fotograf (NO ROLES!) */}
          <div className="w-full max-w-lg p-4 rounded-3xl bg-zinc-950/90 border border-zinc-800/80 text-left space-y-1.5 z-10">
            <h4 className="font-bold text-white text-sm">
              {activeLightboxPhoto.taskTitle || activeLightboxPhoto.caption || 'Foto-Aufgabe'}
            </h4>
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 text-purple-300 font-medium">
                <User className="w-3.5 h-3.5" />
                Fotograf: {activeLightboxPhoto.photographerName || 'Gast'}
              </span>
              {activeLightboxPhoto.createdAt && (
                <span className="flex items-center gap-1.5 font-mono text-zinc-400">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(activeLightboxPhoto.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
            <p className="text-[10px] text-zinc-500 text-center pt-1">
              Tipp: Wische nach links/rechts zum Blättern • Auf Smartphones: Foto gedrückt halten zum Speichern
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
