import React, { useState, useEffect, useCallback } from 'react';
import { LoginScreen } from './components/auth/LoginScreen';
import { PlayerArea } from './components/player/PlayerArea';
import { AdminArea } from './components/admin/AdminArea';
import { AdminAuthModal } from './components/admin/AdminAuthModal';
import { MobileNavBar } from './components/navigation/MobileNavBar';
import { Player, GameState, ServerStateResponse, GameSettings } from './types/game';
import { gameApi } from './utils/api';
import { Smartphone, Monitor, Loader2, Sparkles } from 'lucide-react';

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

  // Live state from central server database
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
  });

  const [players, setPlayers] = useState<Player[]>([]);
  const [totalJoinedCount, setTotalJoinedCount] = useState<number>(0);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);

  // Fetch live state from central server (polling every 3 seconds)
  const fetchGameState = useCallback(async () => {
    try {
      const data: ServerStateResponse = await gameApi.getGameState(
        registeredPlayerId,
        isAdminUnlocked ? adminCode : null
      );
      setGameState(data.gameState);
      setPlayers(data.players);
      setTotalJoinedCount(data.totalJoinedCount);

      // Verify if stored player still exists in database
      if (registeredPlayerId) {
        const found = data.players.find((p) => p.id === registeredPlayerId);
        if (!found) {
          // Player was wiped or removed by admin
          localStorage.removeItem(LOCAL_STORAGE_PLAYER_ID);
          setRegisteredPlayerId(null);
        }
      }
    } catch (err) {
      // Temporary network hiccup, retain existing state and retry next interval
    } finally {
      setIsInitializing(false);
    }
  }, [registeredPlayerId, adminCode, isAdminUnlocked]);

  // Initial fetch and 3-second live polling interval
  useEffect(() => {
    fetchGameState();
    const interval = setInterval(fetchGameState, 3000);
    const unsubscribe = gameApi.subscribeToSync(fetchGameState);
    return () => {
      clearInterval(interval);
      unsubscribe();
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

  // Resolve current active player object
  const currentPlayer = players.find((p) => p.id === registeredPlayerId);

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
                Verbinde mit Server...
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
                  onLogoutDevice={handleLogoutDevice}
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
      </div>
    </div>
  );
}
