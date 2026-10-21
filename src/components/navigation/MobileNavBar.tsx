import React from 'react';
import { Zap, Camera, Trophy, Image as ImageIcon, User, Shield } from 'lucide-react';

export type MainNavTab = 'actions' | 'tasks' | 'ranking' | 'gallery' | 'profile' | 'admin';

interface MobileNavBarProps {
  currentTab: MainNavTab;
  onTabChange: (tab: MainNavTab) => void;
  isAdminUnlocked: boolean;
  photosCount?: number;
}

export const MobileNavBar: React.FC<MobileNavBarProps> = ({
  currentTab,
  onTabChange,
  isAdminUnlocked,
  photosCount,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800/90 pb-[env(safe-area-inset-bottom,0px)] shadow-2xl">
      <div
        className={`max-w-md mx-auto grid ${
          isAdminUnlocked ? 'grid-cols-6' : 'grid-cols-5'
        } h-16 items-center px-1`}
      >
        {/* Tab 1: Aktionen */}
        <button
          type="button"
          onClick={() => onTabChange('actions')}
          className={`flex flex-col items-center justify-center gap-1 transition cursor-pointer select-none py-1.5 ${
            currentTab === 'actions'
              ? 'text-[#ff6b00]'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Zap
            className={`w-5 h-5 transition-transform duration-200 ${
              currentTab === 'actions' ? 'scale-110 drop-shadow-[0_0_8px_rgba(255,107,0,0.5)]' : ''
            }`}
          />
          <span
            className={`text-[10px] tracking-tight truncate max-w-full ${
              currentTab === 'actions' ? 'font-black text-[#ff6b00]' : 'font-medium'
            }`}
          >
            Aktionen
          </span>
        </button>

        {/* Tab 2: Aufgaben */}
        <button
          type="button"
          onClick={() => onTabChange('tasks')}
          className={`flex flex-col items-center justify-center gap-1 transition cursor-pointer select-none py-1.5 ${
            currentTab === 'tasks'
              ? 'text-[#ff6b00]'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Camera
            className={`w-5 h-5 transition-transform duration-200 ${
              currentTab === 'tasks' ? 'scale-110 drop-shadow-[0_0_8px_rgba(255,107,0,0.5)]' : ''
            }`}
          />
          <span
            className={`text-[10px] tracking-tight truncate max-w-full ${
              currentTab === 'tasks' ? 'font-black text-[#ff6b00]' : 'font-medium'
            }`}
          >
            Aufgaben
          </span>
        </button>

        {/* Tab 3: Ranking */}
        <button
          type="button"
          onClick={() => onTabChange('ranking')}
          className={`flex flex-col items-center justify-center gap-1 transition cursor-pointer select-none py-1.5 ${
            currentTab === 'ranking'
              ? 'text-[#ff6b00]'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Trophy
            className={`w-5 h-5 transition-transform duration-200 ${
              currentTab === 'ranking' ? 'scale-110 drop-shadow-[0_0_8px_rgba(255,107,0,0.5)]' : ''
            }`}
          />
          <span
            className={`text-[10px] tracking-tight truncate max-w-full ${
              currentTab === 'ranking' ? 'font-black text-[#ff6b00]' : 'font-medium'
            }`}
          >
            Ranking
          </span>
        </button>

        {/* Tab 4: Galerie */}
        <button
          type="button"
          onClick={() => onTabChange('gallery')}
          className={`flex flex-col items-center justify-center gap-1 transition cursor-pointer select-none py-1.5 relative ${
            currentTab === 'gallery'
              ? 'text-purple-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <div className="relative">
            <ImageIcon
              className={`w-5 h-5 transition-transform duration-200 ${
                currentTab === 'gallery' ? 'scale-110 drop-shadow-[0_0_8px_rgba(192,132,252,0.5)]' : ''
              }`}
            />
            {typeof photosCount === 'number' && photosCount > 0 && (
              <span className="absolute -top-1 -right-2 px-1 min-w-[14px] h-3.5 rounded-full bg-purple-600 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {photosCount > 99 ? '99+' : photosCount}
              </span>
            )}
          </div>
          <span
            className={`text-[10px] tracking-tight truncate max-w-full ${
              currentTab === 'gallery' ? 'font-black text-purple-400' : 'font-medium'
            }`}
          >
            Galerie
          </span>
        </button>

        {/* Tab 5: Profil */}
        <button
          type="button"
          onClick={() => onTabChange('profile')}
          className={`flex flex-col items-center justify-center gap-1 transition cursor-pointer select-none py-1.5 ${
            currentTab === 'profile'
              ? 'text-[#ff6b00]'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <User
            className={`w-5 h-5 transition-transform duration-200 ${
              currentTab === 'profile' ? 'scale-110 drop-shadow-[0_0_8px_rgba(255,107,0,0.5)]' : ''
            }`}
          />
          <span
            className={`text-[10px] tracking-tight truncate max-w-full ${
              currentTab === 'profile' ? 'font-black text-[#ff6b00]' : 'font-medium'
            }`}
          >
            Profil
          </span>
        </button>

        {/* Tab 6: Admin (Nur sichtbar wenn Admin entsperrt ist!) */}
        {isAdminUnlocked && (
          <button
            type="button"
            onClick={() => onTabChange('admin')}
            className={`flex flex-col items-center justify-center gap-1 transition cursor-pointer select-none py-1.5 ${
              currentTab === 'admin'
                ? 'text-amber-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Shield
              className={`w-5 h-5 transition-transform duration-200 ${
                currentTab === 'admin' ? 'scale-110 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : ''
              }`}
            />
            <span
              className={`text-[10px] tracking-tight truncate max-w-full ${
                currentTab === 'admin' ? 'font-black text-amber-400' : 'font-medium'
              }`}
            >
              Admin
            </span>
          </button>
        )}
      </div>
    </nav>
  );
};
