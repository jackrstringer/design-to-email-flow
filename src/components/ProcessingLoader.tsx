import { useState, useEffect, useCallback } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProcessingLoaderProps {
  currentStatus: string;
}

// Game constants
const GRID_WIDTH = 20;
const GRID_HEIGHT = 15;
const CELL_SIZE = 20;
const GAME_SPEED = 120;

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type Position = { x: number; y: number };

const STAGES = [
  { id: 'upload', label: 'Upload' },
  { id: 'slice', label: 'Slice' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'ai', label: 'AI' },
];

export function ProcessingLoader({ currentStatus }: ProcessingLoaderProps) {
  const [snake, setSnake] = useState<Position[]>([{ x: 10, y: 7 }]);
  const [food, setFood] = useState<Position>({ x: 15, y: 7 });
  const [direction, setDirection] = useState<Direction | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() =>
    parseInt(localStorage.getItem('snakeHighScore') || '0')
  );

  const spawnFood = useCallback((currentSnake: Position[]): Position => {
    let newFood: Position;
    do {
      newFood = {
        x: Math.floor(Math.random() * GRID_WIDTH),
        y: Math.floor(Math.random() * GRID_HEIGHT),
      };
    } while (currentSnake.some(seg => seg.x === newFood.x && seg.y === newFood.y));
    return newFood;
  }, []);

  const resetGame = useCallback(() => {
    const initialSnake = [{ x: 10, y: 7 }];
    setSnake(initialSnake);
    setFood(spawnFood(initialSnake));
    setDirection(null);
    setGameOver(false);
    setScore(0);
  }, [spawnFood]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      
      e.preventDefault();
      
      if (gameOver) {
        resetGame();
      }

      const keyMap: Record<string, Direction> = {
        ArrowUp: 'UP',
        ArrowDown: 'DOWN',
        ArrowLeft: 'LEFT',
        ArrowRight: 'RIGHT',
      };

      const newDir = keyMap[e.key];
      
      // Prevent reversing direction
      setDirection(prev => {
        if (!prev) return newDir;
        if (prev === 'UP' && newDir === 'DOWN') return prev;
        if (prev === 'DOWN' && newDir === 'UP') return prev;
        if (prev === 'LEFT' && newDir === 'RIGHT') return prev;
        if (prev === 'RIGHT' && newDir === 'LEFT') return prev;
        return newDir;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameOver, resetGame]);

  // Game loop
  useEffect(() => {
    if (!direction || gameOver) return;

    const moveSnake = () => {
      setSnake(prevSnake => {
        const head = prevSnake[0];
        let newHead: Position;

        switch (direction) {
          case 'UP':
            newHead = { x: head.x, y: head.y - 1 };
            break;
          case 'DOWN':
            newHead = { x: head.x, y: head.y + 1 };
            break;
          case 'LEFT':
            newHead = { x: head.x - 1, y: head.y };
            break;
          case 'RIGHT':
            newHead = { x: head.x + 1, y: head.y };
            break;
        }

        // Check wall collision
        if (newHead.x < 0 || newHead.x >= GRID_WIDTH || newHead.y < 0 || newHead.y >= GRID_HEIGHT) {
          setGameOver(true);
          return prevSnake;
        }

        // Check self collision
        if (prevSnake.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
          setGameOver(true);
          return prevSnake;
        }

        const newSnake = [newHead, ...prevSnake];

        // Check food collision
        if (newHead.x === food.x && newHead.y === food.y) {
          setScore(prev => {
            const newScore = prev + 1;
            if (newScore > highScore) {
              setHighScore(newScore);
              localStorage.setItem('snakeHighScore', newScore.toString());
            }
            return newScore;
          });
          setFood(spawnFood(newSnake));
          return newSnake; // Don't remove tail (snake grows)
        }

        newSnake.pop(); // Remove tail
        return newSnake;
      });
    };

    const interval = setInterval(moveSnake, GAME_SPEED);
    return () => clearInterval(interval);
  }, [direction, gameOver, food, highScore, spawnFood]);

  // Status logic
  const getStageStatus = (stageId: string): 'pending' | 'active' | 'complete' => {
    const status = currentStatus.toLowerCase();
    
    if (stageId === 'upload') {
      if (status.includes('slicing') || status.includes('uploading slice') || status.includes('preparing') || status.includes('analyzing')) return 'complete';
      if (status.includes('uploading original')) return 'active';
      return 'pending';
    }
    if (stageId === 'slice') {
      if (status.includes('uploading slice') || status.includes('preparing') || status.includes('analyzing')) return 'complete';
      if (status.includes('slicing')) return 'active';
      return 'pending';
    }
    if (stageId === 'cloud') {
      if (status.includes('preparing') || status.includes('analyzing')) return 'complete';
      if (status.includes('uploading slice')) return 'active';
      return 'pending';
    }
    if (stageId === 'ai') {
      if (status.includes('analyzing') || status.includes('preparing')) return 'active';
      return 'pending';
    }
    return 'pending';
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        {/* Title */}
        <h2 className="text-2xl font-bold text-foreground">🐍 SNAKE</h2>
        
        {/* Game instructions or game over */}
        {!direction && !gameOver && (
          <p className="text-muted-foreground text-sm">Press any arrow key to start</p>
        )}
        {gameOver && (
          <p className="text-destructive font-semibold">Game Over! Press any arrow key to restart</p>
        )}

        {/* Game board */}
        <div
          className="border-2 border-border rounded-lg bg-card relative"
          style={{
            width: GRID_WIDTH * CELL_SIZE,
            height: GRID_HEIGHT * CELL_SIZE,
          }}
        >
          {/* Food */}
          <div
            className="absolute bg-red-500 rounded-sm"
            style={{
              width: CELL_SIZE - 2,
              height: CELL_SIZE - 2,
              left: food.x * CELL_SIZE + 1,
              top: food.y * CELL_SIZE + 1,
            }}
          />
          
          {/* Snake */}
          {snake.map((segment, index) => (
            <div
              key={index}
              className={cn(
                "absolute rounded-sm",
                index === 0 ? "bg-green-500" : "bg-green-400"
              )}
              style={{
                width: CELL_SIZE - 2,
                height: CELL_SIZE - 2,
                left: segment.x * CELL_SIZE + 1,
                top: segment.y * CELL_SIZE + 1,
              }}
            />
          ))}
        </div>

        {/* Score */}
        <div className="flex gap-6 text-sm">
          <span className="text-foreground">Score: <strong>{score}</strong></span>
          <span className="text-muted-foreground">High Score: <strong>{highScore}</strong></span>
        </div>

        {/* Compact status bar */}
        <div className="flex items-center gap-3 mt-2 px-4 py-2 bg-muted/50 rounded-full">
          {STAGES.map((stage, i) => {
            const status = getStageStatus(stage.id);
            return (
              <div key={stage.id} className="flex items-center gap-1">
                {status === 'complete' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : status === 'active' ? (
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-muted-foreground/30" />
                )}
                <span className={cn(
                  "text-xs",
                  status === 'complete' && "text-muted-foreground",
                  status === 'active' && "text-foreground font-medium",
                  status === 'pending' && "text-muted-foreground/50"
                )}>
                  {stage.label}
                </span>
                {i < STAGES.length - 1 && <span className="text-muted-foreground/30 mx-1">→</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
