import React from 'react';
import { User, Shield, Lock, Sparkles } from 'lucide-react';

interface MobileNavBarProps {
  currentTab: 'player' | 'admin';
  onTabChange: (tab: 'player' | 'admin') => void;
  isAdminUnlocked: boolean;
  onRequestAdminUnlock: () => void;
}

export const MobileNavBar: React.FC<MobileNavBarProps> = ({
  currentTab,
  onTabChange,
  isAdminUnlocked,
  onRequestAdminUnlock,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800/90 pb-[env(safe-area-inset-bottom,0px)]">
      <div className="max-w-md mx-auto grid grid-cols-2 h-16">
        {/* Tab 1: Spieler */}
        <button
          onClick={() => onTabChange('player')}
          className={`flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
            currentTab === 'player' ? 'text-[#ff6b00]' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[11px] font-bold">Mein Spiel</span>
        </button>

        {/* Tab 2: Admin (Nur sichtbar wenn entsperrt, sonst Unlock-Taste) */}
        {isAdminUnlocked ? (
          <button
            onClick={() => onTabChange('admin')}
            className={`flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
              currentTab === 'admin' ? 'text-purple-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Shield className="w-5 h-5" />
            <span className="text-[11px] font-bold">Admin-Zentrale</span>
          </button>
        ) : (
          <button
            onClick={onRequestAdminUnlock}
            className="flex flex-col items-center justify-center gap-1 text-zinc-600 hover:text-zinc-400 transition cursor-pointer"
            title="Spielleiter Login"
          >
            <Lock className="w-4 h-4 opacity-50" />
            <span className="text-[10px] font-medium opacity-50">Spielleiter</span>
          </button>
        )}
      </div>
    </nav>
  );
};
