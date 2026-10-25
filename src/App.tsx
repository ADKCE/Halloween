import React, { useState, useEffect, useCallback } from 'react';
import { LoginScreen } from './components/auth/LoginScreen';
import { PlayerArea } from './components/player/PlayerArea';
import { AdminArea } from './components/admin/AdminArea';
import { AdminAuthModal } from './components/admin/AdminAuthModal';
import { MobileNavBar, MainNavTab } from './components/navigation/MobileNavBar';
import { DebugPanel } from './components/debug/DebugPanel';
import {
  Player,
  GameState,
  ServerStateResponse,
  GameSettings,
  KillRecord,
  PartyTask,
  TaskCompletion,
  PartyPhoto,
  PlayerPhotoTask,
  SpecialTaskAssignment
} from './types/game';
import { gameApi } from './utils/api';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { initGlobalErrorLogging } from './utils/errorLogger';
import { Smartphone, Monitor, Loader2, Sparkles, Database, AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';

const LOCAL_STORAGE_PLAYER_ID = 'halloween_party_player_id';
const LOCAL_STORAGE_RESET_EPOCH = 'halloween_party_reset_epoch';
const SESSION_STORAGE_ADMIN_CODE = 'halloween_party_admin_code';

export default function App() {
  const [registeredPlayerId, setRegisteredPlayerId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(LOCAL_STORAGE_PLAYER_ID);
  });

  const [adminCode, setAdminCode] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem(SESSION_STORAGE_ADMIN_CODE) || '';
  });

  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(sessionStorage.getItem(SESSION_STORAGE_ADMIN_CODE));
  });

  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<MainNavTab>('actions');
  const [isMobileDeviceFrame, setIsMobileDeviceFrame] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<{ title: string; detail: string; timestamp: number } | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Live state from central Supabase database
  const [gameState, setGameState] = useState<GameState>({
    id: 'main',
    status: 'Lobby',
    startedAt: null,
    endedAt: null,
    settings: {
      adminCode: '1031',
      vampireCount: 6,
      werewolfCount: 4,
      ghostCount: 4,
      hunterCount: 10,
      gracePeriodMinutes: 15,
      vampireCooldownMinutes: 6,
      ghostCooldownMinutes: 6,
      werewolfCooldownMinutes: 2,
      hunterHitCooldownMinutes: 15,
      hunterMissPenaltyMinutes: 30,
      killConfirmationTimeoutMinutes: 5,
      fullMoonMinIntervalMinutes: 20,
      fullMoonMaxIntervalMinutes: 40,
      fullMoonDurationMinutes: 5,
      pointsPhotoTask: 10,
      pointsSpecialTask: 20,
      photoDownloadUnlocked: 'ended',
      pointsEvilKill: 15,
      pointsExorcismSuccess: 25,
      specialTaskIntervalMinMinutes: 10,
      specialTaskIntervalMaxMinutes: 20,
    },
    adminCode: '1031',
  });

  const [players, setPlayers] = useState<Player[]>([]);
  const [kills, setKills] = useState<KillRecord[]>([]);
  const [tasks, setTasks] = useState<PartyTask[]>([]);
  const [taskCompletions, setTaskCompletions] = useState<TaskCompletion[]>([]);
  const [photos, setPhotos] = useState<PartyPhoto[]>([]);
  const [photoTasks, setPhotoTasks] = useState<PlayerPhotoTask[]>([]);
  const [specialTasks, setSpecialTasks] = useState<SpecialTaskAssignment[]>([]);
  const [totalJoinedCount, setTotalJoinedCount] = useState<number>(0);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);

  // Fetch live state from Supabase
  const fetchGameState = useCallback(async () => {
    try {
      const data: ServerStateResponse = await gameApi.getGameState(
        registeredPlayerId,
        isAdminUnlocked ? adminCode : null
      );
      setGameState(data.gameState);
      setPlayers(data.players);
      setKills(data.kills || []);
      setTasks(data.tasks || []);
      setTaskCompletions(data.taskCompletions || []);
      setPhotos(data.photos || []);
      setPhotoTasks(data.photoTasks || []);
      setSpecialTasks(data.specialTasks || []);
      setTotalJoinedCount(data.totalJoinedCount);
      setFetchError(null);

      // Verify reset_epoch (erkennt Komplett-Reset und leert lokale Spieler-ID)
      const serverEpoch = data.gameState.resetEpoch;
      if (serverEpoch) {
        const storedEpoch = localStorage.getItem(LOCAL_STORAGE_RESET_EPOCH);
        if (storedEpoch && Number(storedEpoch) < serverEpoch) {
          localStorage.setItem(LOCAL_STORAGE_RESET_EPOCH, String(serverEpoch));
          localStorage.removeItem(LOCAL_STORAGE_PLAYER_ID);
          setRegisteredPlayerId(null);
        } else if (!storedEpoch) {
          localStorage.setItem(LOCAL_STORAGE_RESET_EPOCH, String(serverEpoch));
        }
      }

      // Verify if stored player still exists in Supabase and is not removed
      if (registeredPlayerId) {
        const found = data.players.find((p) => p.id === registeredPlayerId);
        if (!found || found.status === 'entfernt') {
          localStorage.removeItem(LOCAL_STORAGE_PLAYER_ID);
          setRegisteredPlayerId(null);
        }
      }
    } catch (err: any) {
      setFetchError(err?.message || 'Verbindung zu Supabase fehlgeschlagen');
    } finally {
      setIsInitializing(false);
    }
  }, [registeredPlayerId, adminCode, isAdminUnlocked]);

  // Global unhandled error logging init
  useEffect(() => {
    initGlobalErrorLogging(() => registeredPlayerId);
  }, [registeredPlayerId]);

  // Immediate refetch when mobile screen is turned back on or tab focused
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchGameState();
        if (gameState.status === 'Läuft') {
          gameApi.tickGame().catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [fetchGameState, gameState.status]);

  // Periodic game loop tick (checks pending deaths timeout, generates slot photo tasks & mini-games)
  useEffect(() => {
    if (gameState.status !== 'Läuft') return;

    // Run tick on start/resume
    gameApi.tickGame().catch(() => {});

    // Periodic tick every 20 seconds
    const interval = setInterval(() => {
      gameApi.tickGame().catch(() => {});
    }, 20000);

    return () => clearInterval(interval);
  }, [gameState.status]);

  // Realtime subscription + gentle adaptive fallback polling (20s when Realtime connected, 5s when offline)
  useEffect(() => {
    fetchGameState();

    const unsubscribeRealtime = gameApi.subscribeToRealtime(fetchGameState);
    
    // Check status: If connected, poll every 20s. If disconnected/error, poll every 5s.
    const pollIntervalMs = gameApi.getStatus().realtimeStatus === 'CONNECTED' ? 20000 : 5000;
    const interval = setInterval(fetchGameState, pollIntervalMs);

    return () => {
      clearInterval(interval);
      unsubscribeRealtime();
    };
  }, [fetchGameState]);

  // Handle Player Registration
  const handleRegisterPlayer = async (playerData: {
    name: string;
    costumeName: string;
    photoUrl: string;
  }) => {
    setIsRegistering(true);
    try {
      const newPlayer = await gameApi.registerPlayer(playerData);
      localStorage.setItem(LOCAL_STORAGE_PLAYER_ID, newPlayer.id);
      setRegisteredPlayerId(newPlayer.id);
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Registrierung fehlgeschlagen.');
    } finally {
      setIsRegistering(false);
    }
  };

  // Logout on this device
  const handleLogoutDevice = () => {
    if (confirm('Möchtest du dich auf diesem Gerät wirklich abmelden? Dein Spielerprofil bleibt in der Datenbank erhalten.')) {
      localStorage.removeItem(LOCAL_STORAGE_PLAYER_ID);
      setRegisteredPlayerId(null);
    }
  };

  // Verify Admin Code
  const handleVerifyAdminCode = async (codeToVerify: string): Promise<boolean> => {
    try {
      const success = await gameApi.verifyAdminCode(codeToVerify);
      if (success) {
        setAdminCode(codeToVerify);
        setIsAdminUnlocked(true);
        sessionStorage.setItem(SESSION_STORAGE_ADMIN_CODE, codeToVerify);
        setCurrentTab('admin');
        setTimeout(fetchGameState, 50);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Admin Actions
  const handleAdminStartGame = async () => {
    try {
      await gameApi.startGame(adminCode);
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Spielstart');
    }
  };

  const handleAdminAbortGame = async () => {
    try {
      await gameApi.abortGame(adminCode);
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Abbrechen');
    }
  };

  const handleAdminEndGame = async () => {
    try {
      await gameApi.endGame(adminCode);
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Beenden des Spiels');
    }
  };

  const handleAdminReopenGame = async () => {
    try {
      await gameApi.reopenGame(adminCode);
      await fetchGameState();
      setSuccessToast('Das Spiel wurde wieder geöffnet (Status: Läuft)!');
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Wiedereröffnen des Spiels');
    }
  };

  const handleAdminRestart = async (keepPlayers: boolean) => {
    try {
      await gameApi.restartGame(adminCode, keepPlayers);
      if (!keepPlayers) {
        localStorage.removeItem(LOCAL_STORAGE_PLAYER_ID);
        setRegisteredPlayerId(null);
      }
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Neustart');
    }
  };

  const handleAdminReassignRoles = async () => {
    try {
      const res = await gameApi.reassignRoles(adminCode);
      alert(res.message);
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Neuverteilen der Rollen');
    }
  };

  const handleAdminPlayerAction = async (
    playerId: string,
    action: 'entfernen' | 'wiederbeleben' | 'toeten' | 'pausieren'
  ) => {
    try {
      await gameApi.playerAction(adminCode, playerId, action);
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Aktion fehlgeschlagen');
    }
  };

  const handleAdminUpdateSettings = async (newSettings: Partial<GameSettings>) => {
    try {
      await gameApi.updateSettings(adminCode, newSettings);
      if (newSettings.adminCode) {
        setAdminCode(newSettings.adminCode);
        sessionStorage.setItem(SESSION_STORAGE_ADMIN_CODE, newSettings.adminCode);
      }
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Speichern der Einstellungen');
    }
  };

  const handleTriggerFullMoon = async (durationMinutes = 5) => {
    try {
      await gameApi.triggerManualFullMoon(adminCode, durationMinutes);
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Auslösen des Vollmonds');
    }
  };

  const handleStopFullMoon = async () => {
    try {
      await gameApi.stopFullMoon(adminCode);
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Beenden des Vollmonds');
    }
  };

  const handleAdminConfirmKill = async (killId: string) => {
    try {
      await gameApi.confirmKill(killId);
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Bestätigung fehlgeschlagen');
    }
  };

  const handleAdminUndoKill = async (killId: string) => {
    try {
      await gameApi.adminUndoKill(adminCode, killId);
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Rückgängigmachen');
    }
  };

  const handleAdminConfirmPendingDeath = async (victimId: string) => {
    try {
      await gameApi.adminConfirmKill(adminCode, victimId);
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Bestätigung fehlgeschlagen');
    }
  };

  const handleAdminRevivePendingDeath = async (playerId: string) => {
    try {
      await gameApi.adminRevivePlayer(adminCode, playerId);
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Wiederbeleben fehlgeschlagen');
    }
  };

  const handleAdminDeletePhoto = async (photoId: string) => {
    try {
      await gameApi.deletePhoto(adminCode, photoId);
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Löschen des Fotos');
    }
  };

  const handlePlayerDeletePhoto = async (photoId: string) => {
    try {
      await gameApi.deletePhoto({
        photoId,
        playerId: registeredPlayerId || undefined,
        adminCode: isAdminUnlocked ? adminCode : undefined,
      });
      await fetchGameState();
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Löschen des Fotos');
      throw err;
    }
  };

  const handleSelfReportDeath = async () => {
    if (!registeredPlayerId) return;

    // 1. Sofortiger lokaler Optimistic Update (Spieler sieht sofort den "Warte auf Bestätigung durch den Täter"-Screen!)
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === registeredPlayerId
          ? { ...p, status: 'pending_death' as const, pendingDeathAt: new Date().toISOString() }
          : p
      )
    );

    try {
      const res = await gameApi.reportPendingDeath(registeredPlayerId);
      setSuccessToast(res.message);
      setTimeout(() => setSuccessToast(null), 5000);
      await fetchGameState();
    } catch (err: any) {
      console.error('Fehler bei reportPendingDeath:', err);
      // Fehler IMMER sichtbar ausgeben!
      setErrorMessage({
        title: 'Fehler beim Als-Tot-Melden',
        detail: err?.message || 'Die Datenbank hat das Update verweigert.',
        timestamp: Date.now(),
      });
      // Nach Fehler State wieder mit DB synchronisieren
      await fetchGameState();
      throw err;
    }
  };

  // Resolve current active player object
  const currentPlayer = players.find((p) => p.id === registeredPlayerId);
  const supabaseStatus = gameApi.getStatus();

  return (
    <div
      className={`min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-[#ff6b00] selection:text-white ${
        isMobileDeviceFrame ? 'py-8 px-4 items-center justify-center bg-zinc-900' : ''
      }`}
    >
      {/* Optional Smartphone Preview Frame for desktop testing */}
      <div
        className={
          isMobileDeviceFrame
            ? 'w-full max-w-[420px] min-h-[850px] bg-zinc-950 rounded-[48px] border-4 border-zinc-700 shadow-2xl overflow-hidden flex flex-col relative'
            : 'w-full flex-1 flex flex-col'
        }
      >
        {/* Quick Viewport Toggle on top corner */}
        <div className="absolute top-2 right-2 z-30">
          <button
            onClick={() => setIsMobileDeviceFrame(!isMobileDeviceFrame)}
            className="p-1.5 rounded-full bg-black/60 text-zinc-400 hover:text-white backdrop-blur-md transition cursor-pointer"
            title={isMobileDeviceFrame ? 'Vollbildmodus' : 'Handy-Rahmen aktivieren'}
          >
            {isMobileDeviceFrame ? <Monitor className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* GLOBAL ERROR TOAST (FEHLER IMMER SICHTBAR ANZEIGEN) */}
        {errorMessage && (
          <div className="m-3 p-3.5 rounded-2xl bg-rose-950 border-2 border-rose-500 text-rose-100 text-xs shadow-2xl flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-2 z-50">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-0.5">
                <span className="font-bold text-rose-300 block text-xs">{errorMessage.title}</span>
                <p className="text-[11px] text-rose-200/90 break-words leading-relaxed">{errorMessage.detail}</p>
                <span className="text-[9px] text-rose-400/80 font-mono block">
                  {new Date(errorMessage.timestamp).toLocaleTimeString()} • Siehe ?debug=1 für Details
                </span>
              </div>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 rounded-lg text-rose-400 hover:text-white hover:bg-rose-900/50 transition cursor-pointer shrink-0"
              title="Schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* GLOBAL SUCCESS TOAST */}
        {successToast && (
          <div className="m-3 p-3 rounded-2xl bg-emerald-950 border border-emerald-500/70 text-emerald-200 text-xs shadow-xl flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-2 z-50">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-[11px] font-bold">{successToast}</span>
            </div>
            <button
              onClick={() => setSuccessToast(null)}
              className="p-1 rounded-lg text-emerald-400 hover:text-white transition cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Configuration Notice if Supabase credentials are not set */}
        {!supabaseStatus.isConfigured && (
          <div className="m-3 p-3.5 rounded-2xl bg-amber-950/80 border-2 border-amber-500/50 text-amber-200 text-xs shadow-xl space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-300">
              <Database className="w-4 h-4 shrink-0" />
              <span>Supabase-Konfiguration erforderlich</span>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              Trage <code className="font-mono bg-black/50 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> und{' '}
              <code className="font-mono bg-black/50 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> in Cloudflare Pages bzw.{' '}
              <code className="font-mono bg-black/50 px-1 py-0.5 rounded">.env</code> ein.
            </p>
            <div className="text-[10px] text-amber-300/80">
              Tipp: Hänge <span className="font-bold underline text-white">?debug=1</span> an die URL an, um Supabase-Keys testweise direkt im Browser einzutragen!
            </div>
          </div>
        )}

        {/* INITIAL LOADING STATE */}
        {isInitializing && registeredPlayerId ? (
          <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-[#ff6b00]/15 border border-[#ff6b00]/30 flex items-center justify-center text-[#ff6b00] animate-pulse">
              <Sparkles className="w-8 h-8" />
            </div>
            <div>
              <h2 className="font-serif font-black text-xl text-white">Halloween-Party</h2>
              <p className="text-xs text-zinc-400 mt-1 flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#ff6b00]" />
                Verbinde mit Supabase...
              </p>
            </div>
          </div>
        ) : !currentPlayer || !registeredPlayerId ? (
          isAdminUnlocked && currentTab === 'admin' ? (
            /* ADMIN DIREKT ANZEIGEN, AUCH OHNE EIGENEN SPIELER */
            <div className="flex-1 flex flex-col justify-between">
              <main className="flex-1 p-4 pb-24 max-w-md w-full mx-auto">
                <ErrorBoundary tabName="Admin-Bereich">
                  <AdminArea
                    gameStatus={gameState.status}
                    players={players}
                    settings={gameState.settings}
                    adminCode={adminCode}
                    kills={kills}
                    photos={photos}
                    lastTickAt={gameState.lastTickAt}
                    onStartGame={handleAdminStartGame}
                    onReassignRoles={handleAdminReassignRoles}
                    onAbortGame={handleAdminAbortGame}
                    onEndGame={handleAdminEndGame}
                    onReopenGame={handleAdminReopenGame}
                    onRestartGame={handleAdminRestart}
                    onPlayerAction={handleAdminPlayerAction}
                    onUpdateSettings={handleAdminUpdateSettings}
                    onTriggerFullMoon={handleTriggerFullMoon}
                    onStopFullMoon={handleStopFullMoon}
                    onConfirmKill={handleAdminConfirmKill}
                    onUndoKill={handleAdminUndoKill}
                    onDeletePhoto={handleAdminDeletePhoto}
                    onAdminConfirmPendingDeath={handleAdminConfirmPendingDeath}
                    onAdminRevivePendingDeath={handleAdminRevivePendingDeath}
                    onRefreshState={fetchGameState}
                    onToast={(msg, type) => {
                      if (type === 'error') {
                        setErrorMessage({ title: 'Admin-Fehler', detail: msg, timestamp: Date.now() });
                      } else {
                        setSuccessToast(msg);
                        setTimeout(() => setSuccessToast(null), 4000);
                      }
                    }}
                  />
                </ErrorBoundary>
              </main>
              <MobileNavBar
                currentTab={currentTab}
                onTabChange={setCurrentTab}
                isAdminUnlocked={isAdminUnlocked}
                photosCount={photos.length}
              />
            </div>
          ) : (
            /* STEP 1: LOGIN-SCREEN */
            <ErrorBoundary tabName="Login-Screen">
              <LoginScreen
                onRegister={handleRegisterPlayer}
                isLoading={isRegistering}
                onRequestAdminUnlock={() => setIsAdminModalOpen(true)}
              />
            </ErrorBoundary>
          )
        ) : (
          /* STEP 2 & 3: SPIELBEREICH / ADMIN */
          <div className="flex-1 flex flex-col justify-between">
            <main className="flex-1 p-4 pb-24 max-w-md w-full mx-auto">
              {currentTab !== 'admin' ? (
                <ErrorBoundary tabName="Spieler-Bereich">
                  <PlayerArea
                    player={currentPlayer}
                    players={players}
                    gameState={gameState}
                    totalJoinedCount={totalJoinedCount}
                    kills={kills}
                    tasks={tasks}
                    taskCompletions={taskCompletions}
                    photos={photos}
                    photoTasks={photoTasks}
                    specialTasks={specialTasks}
                    activeTab={currentTab}
                    onTabChange={setCurrentTab}
                    onLogoutDevice={handleLogoutDevice}
                    onRefreshState={fetchGameState}
                    onSelfReportDeath={handleSelfReportDeath}
                    onDeletePhoto={handlePlayerDeletePhoto}
                    onRequestAdminUnlock={() => setIsAdminModalOpen(true)}
                    isAdminUnlocked={isAdminUnlocked}
                    onToast={(msg, type) => {
                      if (type === 'error') {
                        setErrorMessage({
                          title: 'Fehler',
                          detail: msg,
                          timestamp: Date.now(),
                        });
                      } else {
                        setSuccessToast(msg);
                        setTimeout(() => setSuccessToast(null), 4000);
                      }
                    }}
                  />
                </ErrorBoundary>
              ) : (
                <ErrorBoundary tabName="Admin-Bereich">
                  <AdminArea
                    gameStatus={gameState.status}
                    players={players}
                    settings={gameState.settings}
                    adminCode={adminCode}
                    kills={kills}
                    photos={photos}
                    lastTickAt={gameState.lastTickAt}
                    onStartGame={handleAdminStartGame}
                    onReassignRoles={handleAdminReassignRoles}
                    onAbortGame={handleAdminAbortGame}
                    onEndGame={handleAdminEndGame}
                    onReopenGame={handleAdminReopenGame}
                    onRestartGame={handleAdminRestart}
                    onPlayerAction={handleAdminPlayerAction}
                    onUpdateSettings={handleAdminUpdateSettings}
                    onTriggerFullMoon={handleTriggerFullMoon}
                    onStopFullMoon={handleStopFullMoon}
                    onConfirmKill={handleAdminConfirmKill}
                    onUndoKill={handleAdminUndoKill}
                    onDeletePhoto={handleAdminDeletePhoto}
                    onAdminConfirmPendingDeath={handleAdminConfirmPendingDeath}
                    onAdminRevivePendingDeath={handleAdminRevivePendingDeath}
                    onRefreshState={fetchGameState}
                    onToast={(msg, type) => {
                      if (type === 'error') {
                        setErrorMessage({ title: 'Admin-Fehler', detail: msg, timestamp: Date.now() });
                      } else {
                        setSuccessToast(msg);
                        setTimeout(() => setSuccessToast(null), 4000);
                      }
                    }}
                  />
                </ErrorBoundary>
              )}
            </main>

            {/* Mobile Bottom Navigation Bar */}
            <MobileNavBar
              currentTab={currentTab}
              onTabChange={setCurrentTab}
              isAdminUnlocked={isAdminUnlocked}
              photosCount={photos.length}
            />
          </div>
        )}

        {/* ADMIN AUTH PIN MODAL */}
        <AdminAuthModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          onVerify={handleVerifyAdminCode}
        />

        {/* DEBUG PANEL (Only accessible when Admin is unlocked & ?debug=1) */}
        {isAdminUnlocked && (
          <DebugPanel
            registeredPlayerId={registeredPlayerId}
            gameStatus={gameState.status}
            totalJoinedCount={totalJoinedCount}
            onRefresh={fetchGameState}
          />
        )}
      </div>
    </div>
  );
}
