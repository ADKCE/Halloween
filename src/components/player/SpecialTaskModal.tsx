import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  Play,
  RotateCcw,
  Zap,
  HelpCircle,
  Eye,
  ShieldAlert,
  Loader2,
  Award
} from 'lucide-react';
import { SpecialTaskAssignment, RoleType } from '../../types/game';
import { soundEffects } from '../../utils/soundEffects';

interface SpecialTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: SpecialTaskAssignment;
  onSolve: (params: {
    specialTaskId: string;
    playerId: string;
    userAnswer?: number;
    mathAnswers?: number[];
    anagramAnswer?: string;
    sequenceAnswer?: string[];
    codeAnswer?: string;
  }) => Promise<{
    success: boolean;
    rewardPlayerName: string;
    rewardRole: RoleType;
    message: string;
  }>;
}

export const SpecialTaskModal: React.FC<SpecialTaskModalProps> = ({
  isOpen,
  onClose,
  task,
  onSolve,
}) => {
  // Game lifecycle: 'intro' | 'playing' | 'success' | 'expired'
  const [stage, setStage] = useState<'intro' | 'playing' | 'success' | 'expired'>('intro');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revealedResult, setRevealedResult] = useState<{ name: string; role: RoleType; message: string } | null>(null);

  // Play audio alert on opening
  useEffect(() => {
    if (isOpen) {
      soundEffects.playSpookyAlert();
    }
  }, [isOpen]);

  // Mini-game timer countdown
  const timeLimit = React.useMemo(() => {
    if (task.type === 'math') return task.taskData?.math?.timeLimitSeconds || 60;
    if (task.type === 'anagram') return task.taskData?.anagram?.timeLimitSeconds || 30;
    if (task.type === 'sequence') return task.taskData?.sequence?.timeLimitSeconds || 40;
    if (task.type === 'quiz') return task.taskData?.quiz?.timeLimitSeconds || 20;
    if (task.type === 'code') return task.taskData?.code?.timeLimitSeconds || 45;
    return 60;
  }, [task]);

  const [secondsRemaining, setSecondsRemaining] = useState<number>(timeLimit);

  useEffect(() => {
    setSecondsRemaining(timeLimit);
  }, [timeLimit, stage]);

  useEffect(() => {
    if (stage !== 'playing') return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setStage('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [stage]);

  // ----------------------------------------------------------------------------
  // 1. KOPFRECHNEN STATE (3 questions in 60s)
  // ----------------------------------------------------------------------------
  const mathQuestions = task.taskData?.math?.questions || [];
  const [currentMathIdx, setCurrentMathIdx] = useState(0);
  const [userMathInput, setUserMathInput] = useState('');
  const [mathAnswers, setMathAnswers] = useState<number[]>([]);

  const handleMathNumberPress = (num: string) => {
    if (userMathInput.length < 5) {
      setUserMathInput((prev) => prev + num);
    }
  };

  const handleMathDelete = () => {
    setUserMathInput((prev) => prev.slice(0, -1));
  };

  const handleMathSubmitQuestion = async () => {
    if (!userMathInput.trim()) return;
    const ansNum = Number(userMathInput.trim());
    const nextAnswers = [...mathAnswers, ansNum];
    setMathAnswers(nextAnswers);
    setUserMathInput('');

    if (currentMathIdx + 1 < mathQuestions.length) {
      setCurrentMathIdx((prev) => prev + 1);
    } else {
      // Finished all 3!
      await finalizeTask({ mathAnswers: nextAnswers });
    }
  };

  // ----------------------------------------------------------------------------
  // 2. ANAGRAMM STATE (30s, letter tiles + text)
  // ----------------------------------------------------------------------------
  const originalWord = (task.taskData?.anagram?.originalWord || '').toUpperCase();
  const scrambledWord = (task.taskData?.anagram?.scrambledWord || '').toUpperCase();
  const [userAnagramInput, setUserAnagramInput] = useState('');
  const [showAnagramHint, setShowAnagramHint] = useState(false);

  const handleAnagramTileClick = (letter: string) => {
    setUserAnagramInput((prev) => prev + letter);
  };

  const handleAnagramSubmit = async () => {
    if (!userAnagramInput.trim()) return;
    await finalizeTask({ anagramAnswer: userAnagramInput.trim().toUpperCase() });
  };

  // ----------------------------------------------------------------------------
  // 3. MERK-SEQUENZ STATE (5 symbols, flash phase then input phase)
  // ----------------------------------------------------------------------------
  const sequenceSymbols = ['🎃', '👻', '🦇', '💀', '🕷️'];
  const targetSequence = task.taskData?.sequence?.sequence || ['🎃', '👻', '🦇', '💀', '🕷️'];
  const [sequenceStep, setSequenceStep] = useState<'showing' | 'input'>('showing');
  const [activeFlashedIdx, setActiveFlashedIdx] = useState<number | null>(null);
  const [userSequence, setUserSequence] = useState<string[]>([]);

  useEffect(() => {
    if (stage === 'playing' && task.type === 'sequence') {
      setSequenceStep('showing');
      setUserSequence([]);
      let step = 0;
      const interval = setInterval(() => {
        if (step < targetSequence.length) {
          const sym = targetSequence[step];
          const symIndex = sequenceSymbols.indexOf(sym);
          setActiveFlashedIdx(symIndex >= 0 ? symIndex : null);
          soundEffects.playTickSound(true);
          step++;
        } else {
          setActiveFlashedIdx(null);
          clearInterval(interval);
          setSequenceStep('input');
        }
      }, 700);

      return () => clearInterval(interval);
    }
  }, [stage, task.type]);

  const handleSequenceTap = async (sym: string) => {
    if (sequenceStep !== 'input') return;
    soundEffects.playTickSound(false);
    const nextSeq = [...userSequence, sym];
    setUserSequence(nextSeq);

    if (nextSeq.length === targetSequence.length) {
      await finalizeTask({ sequenceAnswer: nextSeq });
    }
  };

  // ----------------------------------------------------------------------------
  // 4. HALLOWEEN-QUIZ STATE (20s, 1 multiple choice question)
  // ----------------------------------------------------------------------------
  const quizData = task.taskData?.quiz;
  const [selectedQuizIdx, setSelectedQuizIdx] = useState<number | null>(null);

  const handleQuizAnswer = async (idx: number) => {
    setSelectedQuizIdx(idx);
    await finalizeTask({ userAnswer: idx });
  };

  // ----------------------------------------------------------------------------
  // 5. GEHEIMCODE STATE (45s, 4-digit guessing with feedback)
  // ----------------------------------------------------------------------------
  const secretCode = task.taskData?.code?.secretCode || '1234';
  const [currentGuess, setCurrentGuess] = useState('');
  const [codeAttempts, setCodeAttempts] = useState<{ guess: string; correctDigits: number; correctPositions: number }[]>([]);

  const handleCodeDigit = (d: string) => {
    if (currentGuess.length < 4) {
      setCurrentGuess((prev) => prev + d);
    }
  };

  const handleCodeDelete = () => {
    setCurrentGuess((prev) => prev.slice(0, -1));
  };

  const handleCodeSubmit = async () => {
    if (currentGuess.length !== 4) return;

    if (currentGuess === secretCode) {
      await finalizeTask({ codeAnswer: currentGuess });
      return;
    }

    // Calculate feedback
    let correctPos = 0;
    const secretArr = secretCode.split('');
    const guessArr = currentGuess.split('');
    const secretUsed = [false, false, false, false];
    const guessUsed = [false, false, false, false];

    // Check positions
    for (let i = 0; i < 4; i++) {
      if (guessArr[i] === secretArr[i]) {
        correctPos++;
        secretUsed[i] = true;
        guessUsed[i] = true;
      }
    }

    // Check correct numbers in wrong spot
    let correctDigits = correctPos;
    for (let i = 0; i < 4; i++) {
      if (!guessUsed[i]) {
        for (let j = 0; j < 4; j++) {
          if (!secretUsed[j] && guessArr[i] === secretArr[j]) {
            correctDigits++;
            secretUsed[j] = true;
            break;
          }
        }
      }
    }

    setCodeAttempts((prev) => [
      {
        guess: currentGuess,
        correctDigits,
        correctPositions: correctPos,
      },
      ...prev,
    ]);

    setCurrentGuess('');
  };

  // ----------------------------------------------------------------------------
  // FINALIZE SUBMIT HELPER
  // ----------------------------------------------------------------------------
  const finalizeTask = async (answerPayload: any) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await onSolve({
        specialTaskId: task.id,
        playerId: task.playerId,
        ...answerPayload,
      });

      if (res.success) {
        soundEffects.playSuccessFanfare();
        setRevealedResult({
          name: res.rewardPlayerName,
          role: res.rewardRole,
          message: res.message,
        });
        setStage('success');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Leider falsch! Versuche es noch einmal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/90 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-md rounded-3xl bg-zinc-950 border-2 border-amber-500/70 p-5 shadow-2xl shadow-amber-950/60 flex flex-col max-h-[92vh] overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-amber-500/20 text-amber-400 animate-pulse">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider block">
                Exklusiv für Menschen
              </span>
              <h3 className="font-serif font-black text-white text-base">
                Spezialaufgabe!
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-zinc-400 hover:text-white bg-zinc-900 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ---------------- STAGE: INTRO ---------------- */}
        {stage === 'intro' && (
          <div className="space-y-4 text-center py-2 animate-in fade-in">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-br from-amber-500/30 via-purple-600/20 to-zinc-900 border border-amber-500/50 flex items-center justify-center text-amber-400 shadow-xl">
              <Zap className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h4 className="text-lg font-bold text-white">{task.title}</h4>
              <p className="text-xs text-zinc-300 leading-relaxed px-2">
                {task.description}
              </p>
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-2 gap-2 text-left pt-2">
              <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 block">Belohnung:</span>
                <span className="text-xs font-bold text-amber-400 block">+20 Punkte</span>
                <span className="text-[10px] text-zinc-300">Deck Rollen Böser auf</span>
              </div>
              <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 block">Zeitlimit:</span>
                <span className="text-xs font-bold text-white block">{timeLimit} Sekunden</span>
                <span className="text-[10px] text-zinc-400">Mini-Game Countdown</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-200/90 text-left">
              💡 <strong>Tipp:</strong> Wenn du die Aufgabe schaffst, erfährst du die wahre geheime Rolle eines Spielers (z.B. Vampir, Werwolf oder Geist). Teile dieses Wissen geheim mit den Geisterjägern!
            </div>

            <button
              onClick={() => setStage('playing')}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-sm tracking-wide shadow-lg shadow-amber-500/30 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-current" />
              Jetzt starten!
            </button>
          </div>
        )}

        {/* ---------------- STAGE: PLAYING ---------------- */}
        {stage === 'playing' && (
          <div className="space-y-4">
            {/* Countdown bar */}
            <div className="flex items-center justify-between px-3 py-2 rounded-2xl bg-zinc-900 border border-zinc-800">
              <span className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-400 animate-spin" />
                Verbleibende Zeit:
              </span>
              <span
                className={`text-base font-mono font-black ${
                  secondsRemaining <= 10 ? 'text-rose-500 animate-pulse' : 'text-amber-400'
                }`}
              >
                00:{secondsRemaining.toString().padStart(2, '0')}
              </span>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-2.5 rounded-2xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2 animate-shake">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 1. KOPFRECHNEN MINI-GAME */}
            {task.type === 'math' && (
              <div className="space-y-4 text-center">
                <div className="flex justify-between items-center text-xs text-zinc-400 px-1">
                  <span>Aufgabe {currentMathIdx + 1} von {mathQuestions.length}</span>
                  <span className="text-amber-400 font-bold">Löse alle 3!</span>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                  <span className="text-xs text-zinc-400">Rechne im Kopf:</span>
                  <div className="text-3xl font-black font-mono text-white tracking-wider">
                    {mathQuestions[currentMathIdx]?.expression} = ?
                  </div>
                </div>

                {/* Answer Display */}
                <div className="h-12 flex items-center justify-center rounded-2xl bg-zinc-950 border-2 border-amber-500/50 text-2xl font-mono font-black text-amber-400">
                  {userMathInput || <span className="text-zinc-600">Eingabe...</span>}
                </div>

                {/* On-screen Keypad */}
                <div className="grid grid-cols-3 gap-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        if (key === 'C') handleMathDelete();
                        else if (key === 'OK') handleMathSubmitQuestion();
                        else handleMathNumberPress(key);
                      }}
                      className={`h-12 rounded-xl text-lg font-bold font-mono transition ${
                        key === 'OK'
                          ? 'bg-amber-500 text-black hover:bg-amber-400'
                          : key === 'C'
                          ? 'bg-rose-950/60 text-rose-300 border border-rose-700/50'
                          : 'bg-zinc-900 text-white hover:bg-zinc-800 border border-zinc-800'
                      }`}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 2. ANAGRAMM MINI-GAME */}
            {task.type === 'anagram' && (
              <div className="space-y-4 text-center">
                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                  <span className="text-xs text-zinc-400">Entschlüssle dieses Halloween-Wort:</span>
                  <div className="text-2xl font-black font-mono text-amber-400 tracking-widest">
                    {scrambledWord}
                  </div>
                </div>

                {/* Letter buttons to tap */}
                <div className="flex flex-wrap justify-center gap-1.5">
                  {scrambledWord.split('').map((char, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAnagramTileClick(char)}
                      className="w-10 h-10 rounded-xl bg-zinc-800 hover:bg-amber-500/20 hover:border-amber-500 border border-zinc-700 text-white font-mono font-bold text-lg active:scale-95 transition"
                    >
                      {char}
                    </button>
                  ))}
                </div>

                {/* Solution Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userAnagramInput}
                    onChange={(e) => setUserAnagramInput(e.target.value.toUpperCase())}
                    placeholder="Wort eingeben..."
                    className="flex-1 px-4 py-3 rounded-2xl bg-zinc-900 border border-zinc-700 text-white font-mono font-bold text-center tracking-widest text-lg uppercase outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={() => setUserAnagramInput('')}
                    className="px-3 rounded-2xl bg-zinc-800 text-zinc-400 hover:text-white"
                  >
                    Clear
                  </button>
                </div>

                {/* Optional Hint */}
                {task.taskData?.anagram?.hint && (
                  <div>
                    {showAnagramHint ? (
                      <p className="text-xs text-amber-300 italic bg-amber-950/40 p-2 rounded-xl border border-amber-500/20">
                        Hinweis: {task.taskData.anagram.hint}
                      </p>
                    ) : (
                      <button
                        onClick={() => setShowAnagramHint(true)}
                        className="text-[11px] text-zinc-400 hover:text-amber-400 underline cursor-pointer"
                      >
                        Tipp anzeigen
                      </button>
                    )}
                  </div>
                )}

                <button
                  onClick={handleAnagramSubmit}
                  disabled={!userAnagramInput.trim() || isSubmitting}
                  className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm transition disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Lösung absenden'}
                </button>
              </div>
            )}

            {/* 3. MERK-SEQUENZ MINI-GAME */}
            {task.type === 'sequence' && (
              <div className="space-y-4 text-center">
                <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <span className="text-xs text-zinc-300 font-bold block">
                    {sequenceStep === 'showing'
                      ? '👀 Merk dir die aufleuchtende Reihenfolge...'
                      : `👉 Tippe die 5 Symbole in der richtigen Reihenfolge nach (${userSequence.length}/5)`}
                  </span>
                </div>

                {/* User sequence progress */}
                <div className="flex justify-center gap-2 h-12 items-center">
                  {targetSequence.map((_, i) => (
                    <div
                      key={i}
                      className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-lg"
                    >
                      {userSequence[i] || '•'}
                    </div>
                  ))}
                </div>

                {/* Symbol Buttons */}
                <div className="grid grid-cols-5 gap-2 pt-2">
                  {sequenceSymbols.map((sym, idx) => {
                    const isFlashed = activeFlashedIdx === idx;
                    return (
                      <button
                        key={idx}
                        disabled={sequenceStep !== 'input' || isSubmitting}
                        onClick={() => handleSequenceTap(sym)}
                        className={`aspect-square rounded-2xl flex items-center justify-center text-3xl border-2 transition transform active:scale-90 ${
                          isFlashed
                            ? 'bg-amber-400 scale-110 border-white shadow-xl shadow-amber-500/50'
                            : 'bg-zinc-900/90 border-zinc-800 hover:border-amber-500/50'
                        }`}
                      >
                        {sym}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. HALLOWEEN-QUIZ MINI-GAME */}
            {task.type === 'quiz' && quizData && (
              <div className="space-y-4 text-left">
                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                  <span className="text-[10px] font-bold uppercase text-amber-400 tracking-wider">
                    Halloween Quiz:
                  </span>
                  <h4 className="font-bold text-white text-sm leading-snug">
                    {quizData.question}
                  </h4>
                </div>

                <div className="space-y-2">
                  {quizData.options.map((opt, idx) => (
                    <button
                      key={idx}
                      disabled={isSubmitting}
                      onClick={() => handleQuizAnswer(idx)}
                      className={`w-full p-3.5 rounded-2xl border text-left text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                        selectedQuizIdx === idx
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800 text-white'
                      }`}
                    >
                      <span>{opt}</span>
                      <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px] font-mono">
                        {String.fromCharCode(65 + idx)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 5. GEHEIMCODE MINI-GAME */}
            {task.type === 'code' && (
              <div className="space-y-4 text-center">
                <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <span className="text-xs text-zinc-300 font-bold block">
                    Errate den 4-stelligen Zahlencode!
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Nach jedem Versuch erhältst du Hinweise.
                  </span>
                </div>

                {/* Display Current Input */}
                <div className="flex justify-center gap-2 h-12 items-center">
                  {[0, 1, 2, 3].map((pos) => (
                    <div
                      key={pos}
                      className="w-10 h-10 rounded-xl bg-zinc-950 border-2 border-amber-500/50 flex items-center justify-center text-xl font-mono font-black text-amber-400"
                    >
                      {currentGuess[pos] || '_'}
                    </div>
                  ))}
                </div>

                {/* Attempts History */}
                {codeAttempts.length > 0 && (
                  <div className="max-h-24 overflow-y-auto space-y-1 text-left px-2">
                    {codeAttempts.map((att, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[11px] bg-zinc-900/70 p-1.5 rounded-xl border border-zinc-800"
                      >
                        <span className="font-mono font-bold text-white tracking-widest">{att.guess}</span>
                        <span className="text-amber-300">
                          {att.correctPositions} an richtiger Stelle, {att.correctDigits} Ziffern richtig
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'Prüfen'].map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        if (key === 'C') handleCodeDelete();
                        else if (key === 'Prüfen') handleCodeSubmit();
                        else handleCodeDigit(key);
                      }}
                      className={`h-11 rounded-xl text-base font-bold font-mono transition ${
                        key === 'Prüfen'
                          ? 'bg-amber-500 text-black hover:bg-amber-400'
                          : key === 'C'
                          ? 'bg-rose-950/60 text-rose-300 border border-rose-700/50'
                          : 'bg-zinc-900 text-white hover:bg-zinc-800 border border-zinc-800'
                      }`}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------------- STAGE: SUCCESS (REVEAL SECRET EVIL ROLE) ---------------- */}
        {stage === 'success' && revealedResult && (
          <div className="space-y-4 text-center py-2 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-950 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-950">
              <Award className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">
                Spezialaufgabe meisterhaft gelöst!
              </span>
              <h4 className="text-xl font-serif font-black text-white">
                +20 Punkte gutgeschrieben
              </h4>
            </div>

            {/* Secret knowledge card */}
            <div className="p-4 rounded-3xl bg-gradient-to-br from-purple-950/80 via-zinc-900 to-amber-950/60 border-2 border-amber-500/80 text-left space-y-2 shadow-xl">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-wider">
                <Eye className="w-4 h-4" />
                Streng geheimes Wissen:
              </div>
              <p className="text-xs text-zinc-300">
                Du hast die geheime Identität eines Bösen enttarnt:
              </p>

              <div className="p-3 rounded-2xl bg-black/80 border border-amber-500/50 text-center">
                <div className="text-lg font-serif font-black text-white">
                  {revealedResult.name}
                </div>
                <div className="text-sm font-bold text-rose-400 flex items-center justify-center gap-1.5 mt-0.5">
                  <ShieldAlert className="w-4 h-4" />
                  Rolle: {revealedResult.role}
                </div>
              </div>

              <p className="text-[11px] text-amber-200/80 italic text-center pt-1">
                🤫 Suche unauffällig einen Geisterjäger und flüstere ihm diesen Namen zu!
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition cursor-pointer"
            >
              Schließen & weiterspielen
            </button>
          </div>
        )}

        {/* ---------------- STAGE: EXPIRED ---------------- */}
        {stage === 'expired' && (
          <div className="space-y-4 text-center py-4 animate-in fade-in">
            <div className="w-14 h-14 mx-auto rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
              <Clock className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-bold text-white">Zeit abgelaufen!</h4>
              <p className="text-xs text-zinc-400 px-4">
                Die Frist für diese Spezialaufgabe ist abgelaufen. Keine Sorge: Es gibt keine Strafe. In Kürze erhältst du eine neue Chance!
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition cursor-pointer"
            >
              Schließen
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
