import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Trophy, Eye, SkipForward, Check, X, Loader2,
  ArrowRight, Star, Zap, Swords, Shield, Target, Crown
} from "lucide-react";

interface ChampionData {
  id: string;
  name: string;
  title: string;
  blurb: string;
  tags: string[];
  info: { attack: number; defense: number; magic: number; difficulty: number };
  stats: { movespeed: number; attackrange: number; hp: number };
  partype: string;
}

interface RoundResult {
  champion: ChampionData;
  cluesUsed: number;
  correct: boolean;
  points: number;
}

type GamePhase = "loading" | "error" | "start" | "playing" | "reveal" | "gameover";

const TOTAL_ROUNDS = 10;
const POINTS_TABLE = [500, 400, 300, 200, 100];

const TAG_PT: Record<string, string> = {
  Fighter: "Lutador",
  Tank: "Tank",
  Mage: "Mago",
  Assassin: "Assassino",
  Marksman: "Atirador",
  Support: "Suporte",
};

function translateTag(tag: string) {
  return TAG_PT[tag] ?? tag;
}

function getDifficulty(d: number) {
  if (d <= 3) return "Iniciante";
  if (d <= 5) return "Moderado";
  if (d <= 7) return "Difícil";
  return "Muito Difícil";
}

function getCombatProfile(c: ChampionData) {
  const { attack, defense, magic } = c.info;
  const ranged = c.stats.attackrange > 300;
  const parts: string[] = [];
  if (magic >= 8) parts.push("altamente mágico");
  else if (attack >= 8) parts.push("altamente físico");
  else if (attack >= 5 && magic >= 5) parts.push("balanceado");
  if (defense >= 7) parts.push("muito resistente");
  else if (defense <= 3) parts.push("muito frágil");
  parts.push(ranged ? "ataque à distância" : "corpo a corpo");
  if (c.stats.movespeed >= 350) parts.push("extremamente veloz");
  return parts.join(", ");
}

interface Clue { label: string; icon: string; text: string }

function makeClues(c: ChampionData): Clue[] {
  return [
    { label: "Classe", icon: "⚔️", text: c.tags.map(translateTag).join(" / ") },
    { label: "Dificuldade", icon: "🎯", text: getDifficulty(c.info.difficulty) },
    { label: "Perfil de Combate", icon: "🛡️", text: getCombatProfile(c) },
    {
      label: "História",
      icon: "📜",
      text: c.blurb.length > 220
        ? c.blurb.slice(0, 220).replace(/\s\S*$/, "") + "…"
        : c.blurb,
    },
    { label: "Título", icon: "👑", text: `"${c.title}"` },
  ];
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘"’’`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isMatch(guess: string, champ: ChampionData) {
  const g = normalize(guess);
  const n = normalize(champ.name);
  if (g === n) return true;
  if (n.includes("&")) {
    const first = normalize(n.split("&")[0]);
    if (g === first) return true;
  }
  if (champ.id === "MonkeyKing" && (g === "wukong" || g === "monkey king")) return true;
  return false;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function splashUrl(id: string) {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg`;
}

function squareUrl(id: string, version: string) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${id}.png`;
}

function getRank(score: number) {
  if (score >= 4000) return { label: "Challenger", color: "#00C8FF" };
  if (score >= 3000) return { label: "Diamante", color: "#9BC6FF" };
  if (score >= 2000) return { label: "Platina", color: "#00D4AA" };
  if (score >= 1000) return { label: "Ouro", color: "#C89B3C" };
  if (score >= 500) return { label: "Prata", color: "#A8C0D6" };
  return { label: "Bronze", color: "#7B5A3C" };
}

export default function App() {
  const [phase, setPhase] = useState<GamePhase>("loading");
  const [champions, setChampions] = useState<ChampionData[]>([]);
  const [version, setVersion] = useState("");
  const [queue, setQueue] = useState<ChampionData[]>([]);
  const [current, setCurrent] = useState<ChampionData | null>(null);
  const [revealed, setRevealed] = useState(1);
  const [guess, setGuess] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const [wrongMsg, setWrongMsg] = useState("");
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const vRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
        const versions: string[] = await vRes.json();
        const v = versions[0];
        setVersion(v);
        const cRes = await fetch(
          `https://ddragon.leagueoflegends.com/cdn/${v}/data/pt_BR/champion.json`
        );
        const cData = await cRes.json();
        const list: ChampionData[] = Object.values(cData.data);
        setChampions(list);
        setPhase("start");
      } catch {
        setPhase("error");
      }
    }
    load();
  }, []);

  const startGame = useCallback(() => {
    const sh = shuffled(champions).slice(0, TOTAL_ROUNDS);
    setCurrent(sh[0]);
    setQueue(sh.slice(1));
    setRevealed(1);
    setGuess("");
    setWrongMsg("");
    setResults([]);
    setRoundResult(null);
    setRound(1);
    setScore(0);
    setPhase("playing");
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [champions]);

  function revealClue() {
    setRevealed(r => Math.min(r + 1, 5));
    setWrongMsg("");
  }

  function submitGuess() {
    if (!current || !guess.trim()) return;
    if (isMatch(guess, current)) {
      const pts = POINTS_TABLE[revealed - 1];
      const res: RoundResult = { champion: current, cluesUsed: revealed, correct: true, points: pts };
      setRoundResult(res);
      setResults(r => [...r, res]);
      setScore(s => s + pts);
      setPhase("reveal");
      setSuggestions([]);
    } else {
      setWrongMsg(`"${guess}" não está correto`);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }

  function skip() {
    if (!current) return;
    const res: RoundResult = { champion: current, cluesUsed: revealed, correct: false, points: 0 };
    setRoundResult(res);
    setResults(r => [...r, res]);
    setPhase("reveal");
    setSuggestions([]);
  }

  function nextRound() {
    if (round >= TOTAL_ROUNDS || queue.length === 0) {
      setPhase("gameover");
      return;
    }
    setCurrent(queue[0]);
    setQueue(q => q.slice(1));
    setRevealed(1);
    setGuess("");
    setWrongMsg("");
    setRoundResult(null);
    setRound(r => r + 1);
    setPhase("playing");
    setTimeout(() => inputRef.current?.focus(), 150);
  }

  useEffect(() => {
    if (!guess.trim() || guess.length < 2 || phase !== "playing") {
      setSuggestions([]);
      return;
    }
    const n = normalize(guess);
    const matches = champions
      .filter(c => normalize(c.name).startsWith(n))
      .slice(0, 6)
      .map(c => c.name);
    setSuggestions(matches);
  }, [guess, champions, phase]);

  const imageFilter =
    phase === "playing"
      ? (() => {
          const blurs = [28, 22, 16, 9, 3];
          const bright = [0.28, 0.33, 0.38, 0.44, 0.52];
          const sat = [0, 0.15, 0.3, 0.55, 0.75];
          const i = revealed - 1;
          return `blur(${blurs[i]}px) brightness(${bright[i]}) saturate(${sat[i]})`;
        })()
      : "blur(0px) brightness(0.82) saturate(1)";

  const clues = current ? makeClues(current) : [];
  const visibleClues = phase === "reveal" ? 5 : revealed;

  // ─── Loading ─────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border border-primary/20 animate-ping" />
          <div className="relative w-20 h-20 rounded-full border border-primary/40 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        </div>
        <div className="text-center">
          <h1
            className="text-3xl font-black tracking-[0.25em] text-primary"
            style={{ fontFamily: "'Cinzel', serif" }}
          >
            INVOCANDO
          </h1>
          <p className="text-muted-foreground mt-2 text-sm tracking-widest">
            Carregando campeões de Runeterra…
          </p>
        </div>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center">
          <X className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl text-foreground" style={{ fontFamily: "'Cinzel', serif" }}>
          Falha na Invocação
        </h2>
        <p className="text-muted-foreground text-sm max-w-xs">
          Não foi possível carregar os dados. Verifique sua conexão e recarregue a página.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-6 py-2 border border-primary/40 text-primary text-sm rounded-sm hover:bg-primary/10 transition-colors"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  // ─── Start Screen ─────────────────────────────────────────────────────────
  if (phase === "start") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_100%,rgba(200,155,60,0.07),transparent)]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="relative z-10 text-center max-w-lg w-full"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-primary/25 rounded-sm mb-8 bg-primary/5">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span
              className="text-primary text-xs tracking-[0.2em] uppercase"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {champions.length} campeões disponíveis
            </span>
          </div>

          <h1
            className="text-foreground font-black leading-none mb-2 tracking-wider"
            style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(2.5rem, 8vw, 5rem)" }}
          >
            CHAMPION
          </h1>
          <h2
            className="text-primary font-bold tracking-[0.5em] mb-2"
            style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(1rem, 3vw, 1.5rem)" }}
          >
            QUIZ
          </h2>
          <p
            className="text-accent text-sm tracking-[0.3em] mb-10 uppercase"
            style={{ fontFamily: "'Cinzel', serif" }}
          >
            League of Legends
          </p>

          <p className="text-muted-foreground mb-2 leading-relaxed" style={{ fontFamily: "'Raleway', sans-serif" }}>
            Descubra o campeão através de{" "}
            <span className="text-foreground font-semibold">5 pistas progressivas</span>.
            Quanto antes acertar, mais pontos ganha.
          </p>
          <p className="text-muted-foreground/60 text-sm mb-8" style={{ fontFamily: "'Raleway', sans-serif" }}>
            10 rodadas por partida · pontuação máxima de 5.000 pts
          </p>

          <div className="grid grid-cols-5 gap-1.5 mb-10 max-w-xs mx-auto">
            {POINTS_TABLE.map((pts, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-1 p-2 rounded-sm bg-card border border-border"
              >
                <span className="text-muted-foreground text-[10px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  P{i + 1}
                </span>
                <span className="text-primary font-bold text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {pts}
                </span>
              </div>
            ))}
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={startGame}
            className="relative overflow-hidden px-14 py-4 bg-primary text-primary-foreground font-bold tracking-[0.3em] uppercase rounded-sm hover:bg-primary/90 transition-colors group"
            style={{ fontFamily: "'Cinzel', serif" }}
          >
            <span className="relative z-10">ENTRAR NA RIFT</span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // ─── Game Over ────────────────────────────────────────────────────────────
  if (phase === "gameover") {
    const maxScore = TOTAL_ROUNDS * POINTS_TABLE[0];
    const pct = Math.round((score / maxScore) * 100);
    const rank = getRank(score);
    const correct = results.filter(r => r.correct).length;

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 md:p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_50%,rgba(200,155,60,0.06),transparent)]" />

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-2xl relative z-10"
        >
          <div className="text-center mb-8">
            <Trophy className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2
              className="text-3xl md:text-4xl font-black tracking-wider text-foreground mb-4"
              style={{ fontFamily: "'Cinzel', serif" }}
            >
              PARTIDA ENCERRADA
            </h2>
            <div
              className="text-6xl md:text-7xl font-black mb-2"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: rank.color }}
            >
              {score}
            </div>
            <div className="text-muted-foreground text-sm mb-3" style={{ fontFamily: "'Raleway', sans-serif" }}>
              {pct}% do máximo possível
            </div>
            <span
              className="inline-block px-4 py-1 border rounded-sm text-sm font-bold tracking-widest"
              style={{
                borderColor: `${rank.color}40`,
                backgroundColor: `${rank.color}10`,
                color: rank.color,
                fontFamily: "'Cinzel', serif",
              }}
            >
              {rank.label}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { icon: Check, label: "Acertos", value: correct, color: "#4CAF50" },
              { icon: X, label: "Erros", value: TOTAL_ROUNDS - correct, color: "#E84057" },
              {
                icon: Star,
                label: "Média pts",
                value: Math.round(score / TOTAL_ROUNDS),
                color: "#C89B3C",
              },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="bg-card border border-border rounded-sm p-3 text-center">
                <Icon className="w-4 h-4 mx-auto mb-1" style={{ color }} />
                <div
                  className="text-2xl font-bold"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color }}
                >
                  {value}
                </div>
                <div className="text-muted-foreground text-xs mt-0.5" style={{ fontFamily: "'Raleway', sans-serif" }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-sm overflow-hidden mb-6">
            <div className="px-4 py-2.5 border-b border-border">
              <span
                className="text-xs text-muted-foreground tracking-widest uppercase"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Histórico de Rodadas
              </span>
            </div>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground shrink-0"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {i + 1}
                  </span>
                  <img
                    src={squareUrl(r.champion.id, version)}
                    alt={r.champion.name}
                    className="w-8 h-8 rounded-sm border border-border shrink-0"
                  />
                  <span className="flex-1 text-foreground text-sm" style={{ fontFamily: "'Raleway', sans-serif" }}>
                    {r.champion.name}
                  </span>
                  <span
                    className="text-xs text-muted-foreground shrink-0"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {r.cluesUsed}p
                  </span>
                  {r.correct ? (
                    <span
                      className="text-emerald-400 font-bold text-sm shrink-0"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      +{r.points}
                    </span>
                  ) : (
                    <span
                      className="text-destructive text-sm shrink-0"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      —
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={startGame}
            className="w-full py-4 bg-primary text-primary-foreground font-black tracking-[0.25em] uppercase rounded-sm hover:bg-primary/90 transition-colors"
            style={{ fontFamily: "'Cinzel', serif" }}
          >
            JOGAR NOVAMENTE
          </button>
        </motion.div>
      </div>
    );
  }

  // ─── Main Game Screen ─────────────────────────────────────────────────────
  if (!current) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ fontFamily: "'Raleway', sans-serif" }}>

      {/* Header */}
      <header className="border-b border-border px-4 md:px-6 py-3 flex items-center justify-between shrink-0 relative">
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <div className="flex items-center gap-3">
          <h1
            className="text-lg md:text-xl font-black text-primary tracking-wider"
            style={{ fontFamily: "'Cinzel', serif" }}
          >
            LoL QUIZ
          </h1>
          <span className="text-border text-lg leading-none hidden sm:block">|</span>
          <span className="text-muted-foreground text-sm hidden sm:block" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            RODADA{" "}
            <span className="text-foreground font-bold">
              {round}/{TOTAL_ROUNDS}
            </span>
          </span>
        </div>

        {/* Round pips */}
        <div className="flex gap-1 items-center">
          {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => {
            const done = i < round - 1;
            const current_ = i === round - 1;
            return (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  current_ ? "w-3 h-3 bg-primary" : done ? "w-2 h-2 bg-primary/50" : "w-2 h-2 bg-muted"
                }`}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-primary" />
          <span
            className="font-bold text-foreground text-lg"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {score}
          </span>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">

        {/* Champion Image Panel */}
        <div className="relative lg:w-[45%] xl:w-2/5 h-52 sm:h-64 lg:h-auto shrink-0 overflow-hidden bg-muted">
          <img
            key={current.id + phase}
            src={splashUrl(current.id)}
            alt={phase === "reveal" ? current.name : "Campeão misterioso"}
            className="w-full h-full object-cover object-top transition-all duration-1000"
            style={{ filter: imageFilter }}
          />

          {/* Dark vignette overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />

          {/* Mystery overlay */}
          {phase === "playing" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div
                className="text-white/15 font-black tracking-[0.3em] select-none"
                style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(3rem, 8vw, 6rem)" }}
              >
                ???
              </div>
              <div
                className="mt-3 text-white/25 text-[10px] tracking-[0.3em] uppercase"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Campeão Desconhecido
              </div>
            </div>
          )}

          {/* Reveal overlay */}
          {phase === "reveal" && roundResult && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="absolute bottom-0 inset-x-0 p-4 md:p-5 bg-gradient-to-t from-black/95 via-black/70 to-transparent"
            >
              <div className="flex items-end gap-3">
                <img
                  src={squareUrl(current.id, version)}
                  alt={current.name}
                  className="w-12 h-12 rounded-sm border border-primary/50 shrink-0"
                />
                <div>
                  <div
                    className="text-white font-black text-xl md:text-2xl leading-tight"
                    style={{ fontFamily: "'Cinzel', serif" }}
                  >
                    {current.name}
                  </div>
                  <div className="text-primary text-sm italic mt-0.5">{current.title}</div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Clue progress indicator */}
          {phase === "playing" && (
            <div className="absolute top-3 left-3 flex gap-1">
              {[1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className={`h-1 w-6 rounded-full transition-all duration-500 ${
                    i <= revealed ? "bg-primary" : "bg-white/20"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Game Panel */}
        <div className="flex-1 flex flex-col p-4 md:p-6 gap-4 overflow-y-auto">

          {/* Clue header */}
          <div className="flex items-center justify-between shrink-0">
            <span
              className="text-xs text-muted-foreground tracking-[0.2em] uppercase"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Pistas Reveladas
            </span>
            {phase === "playing" && (
              <span
                className="text-xs text-primary"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Acertar agora = <span className="font-bold">{POINTS_TABLE[revealed - 1]} pts</span>
              </span>
            )}
          </div>

          {/* Clue Cards */}
          <div className="space-y-2 flex-1">
            <AnimatePresence initial={false}>
              {clues.slice(0, visibleClues).map((clue, i) => {
                const wasRevealed = i < revealed;
                const newlyShown = phase === "reveal" && i >= revealed;
                return (
                  <motion.div
                    key={`${current.id}-clue-${i}`}
                    initial={{ opacity: 0, x: -16, height: 0, marginBottom: 0 }}
                    animate={{ opacity: 1, x: 0, height: "auto", marginBottom: 8 }}
                    transition={{ duration: 0.35, delay: newlyShown ? i * 0.08 : 0 }}
                    className={`border rounded-sm p-3 md:p-4 flex items-start gap-3 ${
                      newlyShown
                        ? "border-border/40 bg-card/50"
                        : "border-border bg-card"
                    }`}
                  >
                    <span className="text-xl leading-none shrink-0 mt-0.5">{clue.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-[10px] uppercase tracking-wider mb-1 ${
                          newlyShown ? "text-muted-foreground/50" : "text-muted-foreground"
                        }`}
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {clue.label}
                      </div>
                      <div
                        className={`text-sm leading-relaxed ${
                          newlyShown ? "text-foreground/50" : "text-foreground"
                        }`}
                      >
                        {clue.text}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Playing: Input + Buttons */}
          {phase === "playing" && (
            <div className="space-y-3 shrink-0">
              {wrongMsg && (
                <motion.div
                  key={wrongMsg}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-destructive text-sm"
                >
                  <X className="w-4 h-4 shrink-0" />
                  <span>{wrongMsg}</span>
                </motion.div>
              )}

              <div className="relative">
                <motion.div
                  animate={shake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <input
                    ref={inputRef}
                    value={guess}
                    onChange={e => setGuess(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") submitGuess();
                      if (e.key === "Escape") setSuggestions([]);
                    }}
                    placeholder="Digite o nome do campeão…"
                    className="w-full bg-input-background border border-border rounded-sm px-4 py-3 text-foreground placeholder-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors text-sm"
                    style={{ fontFamily: "'Raleway', sans-serif" }}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {guess && (
                    <button
                      onClick={() => { setGuess(""); setSuggestions([]); inputRef.current?.focus(); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </motion.div>

                <AnimatePresence>
                  {suggestions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-sm overflow-hidden shadow-2xl"
                    >
                      {suggestions.map(s => (
                        <button
                          key={s}
                          onMouseDown={e => {
                            e.preventDefault();
                            setGuess(s);
                            setSuggestions([]);
                            inputRef.current?.focus();
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-primary/10 hover:text-primary transition-colors border-b border-border/40 last:border-0"
                          style={{ fontFamily: "'Raleway', sans-serif" }}
                        >
                          {s}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={submitGuess}
                  disabled={!guess.trim()}
                  className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm tracking-widest"
                  style={{ fontFamily: "'Cinzel', serif" }}
                >
                  <Check className="w-4 h-4" />
                  CONFIRMAR
                </button>

                {revealed < 5 ? (
                  <button
                    onClick={revealClue}
                    className="px-4 py-3 bg-secondary text-secondary-foreground font-semibold rounded-sm hover:bg-secondary/80 transition-colors flex items-center gap-1.5 text-sm whitespace-nowrap shrink-0"
                  >
                    <Eye className="w-4 h-4" />
                    <span className="hidden sm:inline">Pista</span>
                  </button>
                ) : null}

                <button
                  onClick={skip}
                  className="px-4 py-3 bg-destructive/15 text-destructive font-semibold rounded-sm hover:bg-destructive/25 transition-colors flex items-center gap-1.5 text-sm whitespace-nowrap shrink-0 border border-destructive/20"
                >
                  <SkipForward className="w-4 h-4" />
                  <span className="hidden sm:inline">Pular</span>
                </button>
              </div>

              {revealed < 5 && (
                <p
                  className="text-muted-foreground/50 text-xs text-center"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {5 - revealed} pista{5 - revealed > 1 ? "s" : ""} restante{5 - revealed > 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}

          {/* Reveal: Result + Next */}
          {phase === "reveal" && roundResult && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-3 shrink-0"
            >
              <div
                className={`p-4 rounded-sm border flex items-center gap-4 ${
                  roundResult.correct
                    ? "bg-emerald-950/25 border-emerald-500/25"
                    : "bg-destructive/8 border-destructive/25"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    roundResult.correct ? "bg-emerald-900/40" : "bg-destructive/15"
                  }`}
                >
                  {roundResult.correct ? (
                    <Check className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <X className="w-5 h-5 text-destructive" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {roundResult.correct ? (
                    <>
                      <div className="text-emerald-400 font-bold text-sm">
                        Correto! Usando {roundResult.cluesUsed} pista{roundResult.cluesUsed > 1 ? "s" : ""}
                      </div>
                      <div className="text-muted-foreground text-xs mt-0.5">
                        Excelente memória, Invocador!
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-destructive font-bold text-sm">Não acertou desta vez</div>
                      <div className="text-muted-foreground text-xs mt-0.5">
                        Era{" "}
                        <span className="text-foreground font-semibold">{current.name}</span>
                      </div>
                    </>
                  )}
                </div>
                {roundResult.correct && (
                  <div className="text-right shrink-0">
                    <div
                      className="text-2xl font-black text-emerald-400"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      +{roundResult.points}
                    </div>
                    <div className="text-xs text-emerald-600">pts</div>
                  </div>
                )}
              </div>

              <button
                onClick={nextRound}
                className="w-full py-4 bg-primary text-primary-foreground font-black tracking-[0.2em] uppercase rounded-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 relative overflow-hidden group"
                style={{ fontFamily: "'Cinzel', serif" }}
              >
                <span className="relative z-10 flex items-center gap-2">
                  {round >= TOTAL_ROUNDS ? (
                    <>
                      <Trophy className="w-4 h-4" />
                      VER RESULTADO FINAL
                    </>
                  ) : (
                    <>
                      PRÓXIMO CAMPEÃO
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
