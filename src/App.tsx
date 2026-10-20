import React, { useState, useEffect, useCallback } from 'react';
import { LoginScreen } from './components/auth/LoginScreen';
import { PlayerArea } from './components/player/PlayerArea';
import { AdminArea } from './components/admin/AdminArea';
import { AdminAuthModal } from './components/admin/AdminAuthModal';
import { MobileNavBar } from './components/navigation/MobileNavBar';
import { DebugPanel } from './components/debug/DebugPanel';
import {
  Player,
  GameState,
  ServerStateResponse,
  GameSettings,
  KillRecord,
  PartyTask,
  TaskCompletion,
  PartyPhoto
} from './types/game';
import { gameApi } from './utils/api';
import { Smartphone, Monitor, Loader2, Sparkles, Database, AlertCircle } from 'lucide-react';

const LOCAL_STORAGE_PLAYER_ID = 'halloween_party_player_id';
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
  const [currentTab, setCurrentTab] = useState<'player' | 'admin'>('player');
  const [isMobileDeviceFrame, setIsMobileDeviceFrame] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

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
    },
    adminCode: '1031',
  });

  const [players, setPlayers] = useState<Player[]>([]);
  const [kills, setKills] = useState<KillRecord[]>([]);
  const [tasks, setTasks] = useState<PartyTask[]>([]);
  const [taskCompletions, setTaskCompletions] = useState<TaskCompletion[]>([]);
  const [photos, setPhotos] = useState<PartyPhoto[]>([]);
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
      setTotalJoinedCount(data.totalJoinedCount);
      setFetchError(null);

      // Verify if stored player still exists in Supabase
      if (registeredPlayerId) {
        const found = data.players.find((p) => p.id === registeredPlayerId);
        if (!found) {
          // Player was wiped or removed by admin
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

  // Initial fetch, Supabase Realtime subscription & 3-second fallback polling
  useEffect(() => {
    fetchGameState();

    // 1. Supabase Realtime Subscription
    const unsubscribeRealtime = gameApi.subscribeToRealtime(fetchGameState);

    // 2. 3-Second Fallback Polling (ensures freshness even if realtime is paused/backgrounded)
    const interval = setInterval(fetchGameState, 3000);

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
    } finally {
      setIsRegistering(false);
    }
  };

  // Handle Player Logout from device
  const handleLogoutDevice = () => {
    if (window.confirm('Möchtest du dieses Handy wirklich abmelden?')) {
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

  // Player Actions: Kill, Tasks, Photos
  const handleRecordKill = async (victimId: string) => {
    if (!registeredPlayerId) return;
    await gameApi.recordKill(registeredPlayerId, victimId);
    await fetchGameState();
  };

  const handleCompleteTask = async (taskId: string, photoFileOrBlob?: Blob | File | string) => {
    if (!registeredPlayerId) return;
    await gameApi.completeTask(registeredPlayerId, taskId, photoFileOrBlob);
    await fetchGameState();
  };

  const handleUploadPhoto = async (file: File, caption: string) => {
    if (!registeredPlayerId) return;
    await gameApi.uploadPartyPhoto(registeredPlayerId, file, caption);
    await fetchGameState();
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

        {/* INITIAL LOADING STATE (Prevents flash of login screen on page reload) */}
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
          /* STEP 1: LOGIN-SCREEN */
          <LoginScreen
            onRegister={handleRegisterPlayer}
            isLoading={isRegistering}
          />
        ) : (
          /* STEP 2 & 3: SPIELBEREICH / ADMIN */
          <div className="flex-1 flex flex-col justify-between">
            <main className="flex-1 p-4 pb-24 max-w-md w-full mx-auto">
              {currentTab === 'player' ? (
                <PlayerArea
                  player={currentPlayer}
                  players={players}
                  gameStatus={gameState.status}
                  totalJoinedCount={totalJoinedCount}
                  kills={kills}
                  tasks={tasks}
                  taskCompletions={taskCompletions}
                  photos={photos}
                  onLogoutDevice={handleLogoutDevice}
                  onRecordKill={handleRecordKill}
                  onCompleteTask={handleCompleteTask}
                  onUploadPhoto={handleUploadPhoto}
                />
              ) : (
                <AdminArea
                  gameStatus={gameState.status}
                  players={players}
                  settings={gameState.settings}
                  adminCode={adminCode}
                  onStartGame={handleAdminStartGame}
                  onAbortGame={handleAdminAbortGame}
                  onRestartGame={handleAdminRestart}
                  onPlayerAction={handleAdminPlayerAction}
                  onUpdateSettings={handleAdminUpdateSettings}
                />
              )}
            </main>

            {/* Mobile Bottom Navigation Bar */}
            <MobileNavBar
              currentTab={currentTab}
              onTabChange={setCurrentTab}
              isAdminUnlocked={isAdminUnlocked}
              onRequestAdminUnlock={() => setIsAdminModalOpen(true)}
            />
          </div>
        )}

        {/* ADMIN AUTH PIN MODAL */}
        <AdminAuthModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          onVerify={handleVerifyAdminCode}
        />

        {/* DEBUG PANEL (Visible with ?debug=1 in URL) */}
        <DebugPanel
          registeredPlayerId={registeredPlayerId}
          gameStatus={gameState.status}
          totalJoinedCount={totalJoinedCount}
          onRefresh={fetchGameState}
        />
      </div>
    </div>
  );
}
