import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Zap,
  Box,
  Truck,
  Cpu,
  Layers,
  Download,
  Upload,
  Plus,
  Compass,
  Sliders,
  ChevronRight,
  Volume2,
  VolumeX,
  RefreshCw,
  PackageCheck,
  ShieldAlert,
  BatteryMedium,
  BatteryCharging,
  Navigation,
  Search,
  MapPin,
  Route,
  Info,
  SlidersHorizontal,
  Crosshair,
  ZoomIn,
  ZoomOut,
  Map as MapIcon,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  X,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';

// ==========================================
// TYPES & CONSTANTS
// ==========================================
const GRID_COLS = 16;
const GRID_ROWS = 10;
const ACTIONS = ['up', 'down', 'left', 'right'] as const;
type Action = typeof ACTIONS[number];

type TileType = 'aisle' | 'rack' | 'pick' | 'pack' | 'delivery' | 'charge';

interface Point {
  x: number;
  y: number;
}

interface Order {
  id: string;
  sku: string;
  skuName: string;
  pickLocation: Point;
  packLocation: Point;
  deliveryLocation: Point;
  priority: 'normal' | 'express';
  stage: 'queued' | 'picking' | 'packing' | 'delivering' | 'completed';
  assignedRobotId: string | null;
}

type RobotStatus = 'idle' | 'picking' | 'packing' | 'delivering' | 'charging' | 'yielding';

interface Robot {
  id: string;
  name: string;
  color: string;
  badgeBg: string;
  x: number;
  y: number;
  target: Point | null;
  path: Point[];
  status: RobotStatus;
  battery: number;
  facing: Action;
  currentOrderId: string | null;
  hasPayload: boolean;
  deliveries: number;
  yielding: boolean;
}

interface Hyperparameters {
  learning_rate: number; // alpha
  discount_factor: number; // gamma
  exploration_rate: number; // epsilon
  step_reward: number;
  goal_reward: number;
}

type SimulationMode = 'hybrid' | 'pure_astar' | 'q_learning';

// Map presets
const PRESET_DISTRIBUTION_HUB: { [key: string]: TileType } = {
  // Storage Racks clusters (Building blocks on Google Maps)
  '2,1': 'rack', '3,1': 'rack', '4,1': 'rack',
  '2,2': 'rack', '3,2': 'rack', '4,2': 'rack',
  '7,1': 'rack', '8,1': 'rack', '9,1': 'rack',
  '7,2': 'rack', '8,2': 'rack', '9,2': 'rack',
  '12,1': 'rack', '13,1': 'rack',
  '12,2': 'rack', '13,2': 'rack',

  '2,5': 'rack', '3,5': 'rack', '4,5': 'rack',
  '2,6': 'rack', '3,6': 'rack', '4,6': 'rack',
  '7,5': 'rack', '8,5': 'rack', '9,5': 'rack',
  '7,6': 'rack', '8,6': 'rack', '9,6': 'rack',
  '12,5': 'rack', '13,5': 'rack',
  '12,6': 'rack', '13,6': 'rack',

  // Picking Zones (POIs)
  '1,1': 'pick', '5,2': 'pick', '10,1': 'pick', '1,6': 'pick', '10,6': 'pick',

  // Packing Stations (Logistics hubs)
  '6,4': 'pack', '11,4': 'pack',

  // Delivery Goals (Drop-off docks on right edge)
  '14,8': 'delivery', '15,8': 'delivery', '14,3': 'delivery', '15,3': 'delivery',

  // Charging Docks (EV Charging bays)
  '0,9': 'charge', '1,9': 'charge', '2,9': 'charge',
};

const SKU_CATALOG = [
  { sku: 'SRV-901', name: 'Micro-Servo Actuator' },
  { sku: 'LDR-402', name: 'LiDAR Navigation Sensor' },
  { sku: 'BAT-710', name: 'EV Lithium Cell Pack' },
  { sku: 'GPU-330', name: 'AI Inference Processor' },
  { sku: 'SEN-512', name: 'Time-of-Flight Radar' },
  { sku: 'ENC-881', name: 'Precision Shaft Encoder' },
  { sku: 'ARM-220', name: 'Carbon Fiber Linkage' },
];

// Helper: Coordinate conversion
const colLetter = (col: number) => String.fromCharCode(65 + col);
const coordLabel = (p: Point) => `${colLetter(p.x)}${p.y + 1}`;

// Sound generator with Web Audio API
class SoundFX {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }

  playBlip(freq: number = 520, duration: number = 0.05) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {
      // Audio not permitted or interrupted
    }
  }

  playChime() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + idx * 0.07);
        gain.gain.setValueAtTime(0.05, this.ctx!.currentTime + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + idx * 0.07 + 0.2);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(this.ctx!.currentTime + idx * 0.07);
        osc.stop(this.ctx!.currentTime + idx * 0.07 + 0.2);
      });
    } catch {
      // Audio not permitted
    }
  }
}

const sfx = new SoundFX();

export default function App() {
  // ------------------------------------------
  // Grid & Warehouse Layout State
  // ------------------------------------------
  const [gridTiles, setGridTiles] = useState<{ [key: string]: TileType }>(() => ({
    ...PRESET_DISTRIBUTION_HUB,
  }));
  const [paintTool, setPaintTool] = useState<TileType>('rack');
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // ------------------------------------------
  // Simulation Controls & Time
  // ------------------------------------------
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [simSpeed, setSimSpeed] = useState<number>(1); // 1x, 2x, 5x
  const [tick, setTick] = useState<number>(0);
  const [mode, setMode] = useState<SimulationMode>('hybrid');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Map Layer Visibility Toggles
  const [showPaths, setShowPaths] = useState<boolean>(true);
  const [showQHeatmap, setShowQHeatmap] = useState<boolean>(false);
  const [showCollisionZones, setShowCollisionZones] = useState<boolean>(true);
  const [showCoords, setShowCoords] = useState<boolean>(true);
  const [showLayersMenu, setShowLayersMenu] = useState<boolean>(false);

  // Drawer & Selection States
  const [selectedRobotId, setSelectedRobotId] = useState<string>('R1');
  const [isOrdersDrawerOpen, setIsOrdersDrawerOpen] = useState<boolean>(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(false);
  const [autoDispatch, setAutoDispatch] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // KPI Metrics
  const [deliveriesCompleted, setDeliveriesCompleted] = useState<number>(18);
  const [activeYieldCount, setActiveYieldCount] = useState<number>(0);

  // ------------------------------------------
  // Q-Learning Hyperparameters & State
  // ------------------------------------------
  const [hyperparams, setHyperparams] = useState<Hyperparameters>({
    learning_rate: 0.1,
    discount_factor: 0.95,
    exploration_rate: 0.3,
    step_reward: -1,
    goal_reward: 10,
  });

  // Global Warehouse Q-Table: 160 states (y * 16 + x) x 4 actions [up, down, left, right]
  const [qTable, setQTable] = useState<number[][]>(() => {
    return Array.from({ length: GRID_COLS * GRID_ROWS }, () => [0.0, 0.0, 0.0, 0.0]);
  });

  // ------------------------------------------
  // Multi-Agent Robots (R1–R4) styled with Google Palette
  // ------------------------------------------
  const [robots, setRobots] = useState<Robot[]>([
    {
      id: 'R1',
      name: 'Atlas-01',
      color: '#1A73E8', // Google Blue
      badgeBg: 'bg-[#1A73E8]',
      x: 0,
      y: 0,
      target: { x: 1, y: 1 },
      path: [],
      status: 'picking',
      battery: 88,
      facing: 'right',
      currentOrderId: 'ORD-101',
      hasPayload: false,
      deliveries: 6,
      yielding: false,
    },
    {
      id: 'R2',
      name: 'Titan-02',
      color: '#0284C7', // Deep Teal / Sky
      badgeBg: 'bg-[#0284C7]',
      x: 6,
      y: 3,
      target: { x: 6, y: 4 },
      path: [],
      status: 'packing',
      battery: 74,
      facing: 'down',
      currentOrderId: 'ORD-102',
      hasPayload: true,
      deliveries: 5,
      yielding: false,
    },
    {
      id: 'R3',
      name: 'Valkyrie-03',
      color: '#7C3AED', // Purple
      badgeBg: 'bg-[#7C3AED]',
      x: 14,
      y: 5,
      target: { x: 14, y: 8 },
      path: [],
      status: 'delivering',
      battery: 62,
      facing: 'down',
      currentOrderId: 'ORD-103',
      hasPayload: true,
      deliveries: 4,
      yielding: false,
    },
    {
      id: 'R4',
      name: 'Hermes-04',
      color: '#1E8E3E', // Google Green
      badgeBg: 'bg-[#1E8E3E]',
      x: 1,
      y: 9,
      target: { x: 1, y: 9 },
      path: [],
      status: 'charging',
      battery: 92,
      facing: 'up',
      currentOrderId: null,
      hasPayload: false,
      deliveries: 3,
      yielding: false,
    },
  ]);

  // ------------------------------------------
  // Orders Demand Queue
  // ------------------------------------------
  const [orders, setOrders] = useState<Order[]>([
    {
      id: 'ORD-101',
      sku: 'SRV-901',
      skuName: 'Micro-Servo Actuator',
      pickLocation: { x: 1, y: 1 },
      packLocation: { x: 6, y: 4 },
      deliveryLocation: { x: 14, y: 8 },
      priority: 'express',
      stage: 'picking',
      assignedRobotId: 'R1',
    },
    {
      id: 'ORD-102',
      sku: 'LDR-402',
      skuName: 'LiDAR Navigation Sensor',
      pickLocation: { x: 5, y: 2 },
      packLocation: { x: 6, y: 4 },
      deliveryLocation: { x: 15, y: 8 },
      priority: 'normal',
      stage: 'packing',
      assignedRobotId: 'R2',
    },
    {
      id: 'ORD-103',
      sku: 'BAT-710',
      skuName: 'EV Lithium Cell Pack',
      pickLocation: { x: 10, y: 1 },
      packLocation: { x: 11, y: 4 },
      deliveryLocation: { x: 14, y: 8 },
      priority: 'express',
      stage: 'delivering',
      assignedRobotId: 'R3',
    },
    {
      id: 'ORD-104',
      sku: 'GPU-330',
      skuName: 'AI Inference Processor',
      pickLocation: { x: 1, y: 6 },
      packLocation: { x: 6, y: 4 },
      deliveryLocation: { x: 15, y: 3 },
      priority: 'normal',
      stage: 'queued',
      assignedRobotId: null,
    },
    {
      id: 'ORD-105',
      sku: 'SEN-512',
      skuName: 'Time-of-Flight Radar',
      pickLocation: { x: 10, y: 6 },
      packLocation: { x: 11, y: 4 },
      deliveryLocation: { x: 14, y: 3 },
      priority: 'normal',
      stage: 'queued',
      assignedRobotId: null,
    },
  ]);

  // File import ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync sound setting
  useEffect(() => {
    sfx.enabled = soundEnabled;
  }, [soundEnabled]);

  // ------------------------------------------
  // Helper: Find tiles of specific type
  // ------------------------------------------
  const getTilesOfType = useCallback(
    (type: TileType): Point[] => {
      const list: Point[] = [];
      for (const [key, t] of Object.entries(gridTiles)) {
        if (t === type) {
          const [x, y] = key.split(',').map(Number);
          list.push({ x, y });
        }
      }
      return list;
    },
    [gridTiles]
  );

  // Charger load metric
  const chargerDocks = useMemo(() => getTilesOfType('charge'), [getTilesOfType]);
  const occupiedChargers = useMemo(() => {
    return robots.filter(r => r.status === 'charging').length;
  }, [robots]);

  // ------------------------------------------
  // A* Pathfinding Algorithm (Shortest Street Route)
  // ------------------------------------------
  const findAStarPath = useCallback(
    (start: Point, goal: Point, occupiedPositions: Set<string> = new Set()): Point[] => {
      if (start.x === goal.x && start.y === goal.y) return [];

      interface Node {
        x: number;
        y: number;
        g: number;
        h: number;
        f: number;
        parent: Node | null;
      }

      const openList: Node[] = [];
      const closedSet = new Set<string>();

      const heuristic = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

      openList.push({
        x: start.x,
        y: start.y,
        g: 0,
        h: heuristic(start, goal),
        f: heuristic(start, goal),
        parent: null,
      });

      while (openList.length > 0) {
        openList.sort((a, b) => a.f - b.f);
        const current = openList.shift()!;
        const key = `${current.x},${current.y}`;

        if (current.x === goal.x && current.y === goal.y) {
          const path: Point[] = [];
          let curr: Node | null = current;
          while (curr && curr.parent) {
            path.unshift({ x: curr.x, y: curr.y });
            curr = curr.parent;
          }
          return path;
        }

        closedSet.add(key);

        const neighbors: Point[] = [
          { x: current.x, y: current.y - 1 }, // North
          { x: current.x, y: current.y + 1 }, // South
          { x: current.x - 1, y: current.y }, // West
          { x: current.x + 1, y: current.y }, // East
        ];

        for (const nb of neighbors) {
          if (nb.x < 0 || nb.x >= GRID_COLS || nb.y < 0 || nb.y >= GRID_ROWS) continue;

          const nbKey = `${nb.x},${nb.y}`;
          if (closedSet.has(nbKey)) continue;

          // Storage Racks are physical buildings/obstacles
          if (gridTiles[nbKey] === 'rack' && !(nb.x === goal.x && nb.y === goal.y)) continue;

          const isOccupied = occupiedPositions.has(nbKey) && !(nb.x === goal.x && nb.y === goal.y);
          const moveCost = 1 + (isOccupied ? 8 : 0);

          const gScore = current.g + moveCost;
          const existingOpen = openList.find(n => n.x === nb.x && n.y === nb.y);

          if (!existingOpen) {
            const h = heuristic(nb, goal);
            openList.push({
              x: nb.x,
              y: nb.y,
              g: gScore,
              h,
              f: gScore + h,
              parent: current,
            });
          } else if (gScore < existingOpen.g) {
            existingOpen.g = gScore;
            existingOpen.f = gScore + existingOpen.h;
            existingOpen.parent = current;
          }
        }
      }

      return [];
    },
    [gridTiles]
  );

  // ------------------------------------------
  // Q-Learning Helper: Bellman update & Action Selection
  // ------------------------------------------
  const getActionDelta = (action: Action): Point => {
    switch (action) {
      case 'up':
        return { x: 0, y: -1 };
      case 'down':
        return { x: 0, y: 1 };
      case 'left':
        return { x: -1, y: 0 };
      case 'right':
        return { x: 1, y: 0 };
    }
  };

  const getDeltaAction = (from: Point, to: Point): Action => {
    if (to.y < from.y) return 'up';
    if (to.y > from.y) return 'down';
    if (to.x < from.x) return 'left';
    return 'right';
  };

  const stateIndex = (x: number, y: number) => y * GRID_COLS + x;
  const actionIndex = (action: Action) => ACTIONS.indexOf(action);

  // ------------------------------------------
  // Dispatch New Order
  // ------------------------------------------
  const handleDispatchOrder = useCallback(() => {
    const pickZones = getTilesOfType('pick');
    const packStations = getTilesOfType('pack');
    const deliveryGoals = getTilesOfType('delivery');

    if (pickZones.length === 0 || packStations.length === 0 || deliveryGoals.length === 0) {
      return;
    }

    const randomPick = pickZones[Math.floor(Math.random() * pickZones.length)];
    const randomPack = packStations[Math.floor(Math.random() * packStations.length)];
    const randomDelivery = deliveryGoals[Math.floor(Math.random() * deliveryGoals.length)];
    const randomItem = SKU_CATALOG[Math.floor(Math.random() * SKU_CATALOG.length)];
    const newOrderId = `ORD-${Math.floor(100 + Math.random() * 900)}`;

    const newOrder: Order = {
      id: newOrderId,
      sku: randomItem.sku,
      skuName: randomItem.name,
      pickLocation: randomPick,
      packLocation: randomPack,
      deliveryLocation: randomDelivery,
      priority: Math.random() > 0.65 ? 'express' : 'normal',
      stage: 'queued',
      assignedRobotId: null,
    };

    setOrders(prev => [newOrder, ...prev.slice(0, 11)]);
    sfx.playBlip(680, 0.08);
  }, [getTilesOfType]);

  // ------------------------------------------
  // Simulation Step Tick
  // ------------------------------------------
  const stepSimulation = useCallback(() => {
    setTick(t => t + 1);

    setRobots(currentRobots => {
      const updatedRobots = currentRobots.map(r => ({ ...r }));
      let newYields = 0;
      const intendedPositions: { [key: string]: string } = {};

      // Phase 1: Assign tasks & battery check
      updatedRobots.forEach(robot => {
        if (robot.battery <= 20 && robot.status !== 'charging') {
          const chargers = getTilesOfType('charge');
          if (chargers.length > 0) {
            let closest = chargers[0];
            let minDist = Infinity;
            chargers.forEach(c => {
              const d = Math.abs(robot.x - c.x) + Math.abs(robot.y - c.y);
              if (d < minDist) {
                minDist = d;
                closest = c;
              }
            });
            robot.target = closest;
            robot.status = 'charging';
            robot.path = [];
          }
        }

        if (robot.status === 'charging') {
          const isAtDock = gridTiles[`${robot.x},${robot.y}`] === 'charge';
          if (isAtDock) {
            robot.battery = Math.min(100, robot.battery + 8);
            if (robot.battery >= 96) {
              robot.status = 'idle';
              robot.target = null;
            }
            return;
          }
        }

        if (robot.status === 'idle' || !robot.currentOrderId) {
          setOrders(prevOrders => {
            const unassignedIndex = prevOrders.findIndex(o => o.stage === 'queued' && !o.assignedRobotId);
            if (unassignedIndex >= 0) {
              const order = prevOrders[unassignedIndex];
              robot.currentOrderId = order.id;
              robot.status = 'picking';
              robot.target = order.pickLocation;
              robot.hasPayload = false;

              const updatedOrders = [...prevOrders];
              updatedOrders[unassignedIndex] = {
                ...order,
                stage: 'picking',
                assignedRobotId: robot.id,
              };
              return updatedOrders;
            }
            return prevOrders;
          });
        }
      });

      // Phase 2: Compute path and movement
      const occupiedByOtherRobots = new Set(
        updatedRobots.map(r => `${r.x},${r.y}`)
      );

      updatedRobots.forEach(robot => {
        if (robot.status === 'charging' && gridTiles[`${robot.x},${robot.y}`] === 'charge' && robot.battery < 95) {
          return;
        }

        if (robot.target && robot.x === robot.target.x && robot.y === robot.target.y) {
          setOrders(prevOrders => {
            const orderIndex = prevOrders.findIndex(o => o.id === robot.currentOrderId);
            if (orderIndex >= 0) {
              const order = prevOrders[orderIndex];
              const updatedOrders = [...prevOrders];

              if (robot.status === 'picking') {
                robot.status = 'packing';
                robot.hasPayload = true;
                robot.target = order.packLocation;
                updatedOrders[orderIndex] = { ...order, stage: 'packing' };
                sfx.playBlip(540, 0.04);
              } else if (robot.status === 'packing') {
                robot.status = 'delivering';
                robot.hasPayload = true;
                robot.target = order.deliveryLocation;
                updatedOrders[orderIndex] = { ...order, stage: 'delivering' };
                sfx.playBlip(620, 0.04);
              } else if (robot.status === 'delivering') {
                robot.status = 'idle';
                robot.hasPayload = false;
                robot.target = null;
                robot.deliveries += 1;
                robot.currentOrderId = null;
                updatedOrders[orderIndex] = { ...order, stage: 'completed' };

                setDeliveriesCompleted(d => d + 1);
                sfx.playChime();
              }
              return updatedOrders;
            }
            return prevOrders;
          });

          robot.path = [];
          return;
        }

        if (robot.target) {
          let nextStep: Point | null = null;
          let chosenAction: Action = robot.facing;

          if (mode === 'pure_astar') {
            const path = findAStarPath({ x: robot.x, y: robot.y }, robot.target, occupiedByOtherRobots);
            robot.path = path;
            if (path.length > 0) {
              nextStep = path[0];
              chosenAction = getDeltaAction({ x: robot.x, y: robot.y }, nextStep);
            }
          } else if (mode === 'q_learning') {
            const s = stateIndex(robot.x, robot.y);
            const isExplore = Math.random() < hyperparams.exploration_rate;

            let actionIdx: number;
            if (isExplore) {
              actionIdx = Math.floor(Math.random() * 4);
            } else {
              const qVals = qTable[s] || [0, 0, 0, 0];
              actionIdx = qVals.indexOf(Math.max(...qVals));
            }

            chosenAction = ACTIONS[actionIdx];
            const delta = getActionDelta(chosenAction);
            const candX = Math.max(0, Math.min(GRID_COLS - 1, robot.x + delta.x));
            const candY = Math.max(0, Math.min(GRID_ROWS - 1, robot.y + delta.y));

            if (gridTiles[`${candX},${candY}`] !== 'rack') {
              nextStep = { x: candX, y: candY };
            } else {
              nextStep = { x: robot.x, y: robot.y };
            }
          } else {
            // Hybrid (A* Route Guidance + Q-Learning Local Reinforcement)
            const path = findAStarPath({ x: robot.x, y: robot.y }, robot.target, occupiedByOtherRobots);
            robot.path = path;

            if (path.length > 0) {
              const aStarNext = path[0];
              const aStarAction = getDeltaAction({ x: robot.x, y: robot.y }, aStarNext);

              const isExplore = Math.random() < hyperparams.exploration_rate * 0.35;
              if (!isExplore) {
                nextStep = aStarNext;
                chosenAction = aStarAction;
              } else {
                const s = stateIndex(robot.x, robot.y);
                const qVals = qTable[s] || [0, 0, 0, 0];
                const bestActionIdx = qVals.indexOf(Math.max(...qVals));
                chosenAction = ACTIONS[bestActionIdx];
                const delta = getActionDelta(chosenAction);
                const candX = Math.max(0, Math.min(GRID_COLS - 1, robot.x + delta.x));
                const candY = Math.max(0, Math.min(GRID_ROWS - 1, robot.y + delta.y));

                if (gridTiles[`${candX},${candY}`] !== 'rack') {
                  nextStep = { x: candX, y: candY };
                } else {
                  nextStep = aStarNext;
                  chosenAction = aStarAction;
                }
              }
            }
          }

          // Q-Table Bellman Reinforcement Update
          if (nextStep) {
            const s = stateIndex(robot.x, robot.y);
            const a = actionIndex(chosenAction);
            const nextS = stateIndex(nextStep.x, nextStep.y);

            let reward = hyperparams.step_reward;
            if (robot.target && nextStep.x === robot.target.x && nextStep.y === robot.target.y) {
              reward = hyperparams.goal_reward;
            } else if (gridTiles[`${nextStep.x},${nextStep.y}`] === 'rack') {
              reward = -10;
            }

            setQTable(prevQ => {
              const newQ = [...prevQ];
              const currentQVal = newQ[s][a];
              const maxNextQ = Math.max(...newQ[nextS]);
              const updatedQVal =
                currentQVal +
                hyperparams.learning_rate *
                  (reward + hyperparams.discount_factor * maxNextQ - currentQVal);

              const updatedRow = [...newQ[s]];
              updatedRow[a] = parseFloat(updatedQVal.toFixed(3));
              newQ[s] = updatedRow;
              return newQ;
            });

            // Collision avoidance validation
            const nextKey = `${nextStep.x},${nextStep.y}`;
            const isCollidingWithIntended = intendedPositions[nextKey] && intendedPositions[nextKey] !== robot.id;
            const isCollidingWithStaticRobot =
              occupiedByOtherRobots.has(nextKey) &&
              !(nextStep.x === robot.x && nextStep.y === robot.y);

            if (isCollidingWithIntended || isCollidingWithStaticRobot) {
              robot.yielding = true;
              newYields += 1;
            } else {
              intendedPositions[nextKey] = robot.id;
              robot.yielding = false;
              robot.x = nextStep.x;
              robot.y = nextStep.y;
              robot.facing = chosenAction;
              robot.battery = Math.max(0, robot.battery - 0.4);
            }
          }
        }
      });

      setActiveYieldCount(newYields);
      return updatedRobots;
    });

    if (autoDispatch && Math.random() > 0.65) {
      setOrders(currentOrders => {
        const queuedCount = currentOrders.filter(o => o.stage === 'queued').length;
        if (queuedCount < 2) {
          setTimeout(() => handleDispatchOrder(), 50);
        }
        return currentOrders;
      });
    }
  }, [
    mode,
    hyperparams,
    gridTiles,
    qTable,
    findAStarPath,
    getTilesOfType,
    autoDispatch,
    handleDispatchOrder,
  ]);

  // Simulation Timer
  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = Math.round(750 / simSpeed);
    const timer = setInterval(() => {
      stepSimulation();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, simSpeed, stepSimulation]);

  // Reset
  const handleReset = () => {
    setIsPlaying(false);
    setTick(0);
    setActiveYieldCount(0);
    setRobots([
      {
        id: 'R1',
        name: 'Atlas-01',
        color: '#1A73E8',
        badgeBg: 'bg-[#1A73E8]',
        x: 0,
        y: 0,
        target: { x: 1, y: 1 },
        path: [],
        status: 'picking',
        battery: 95,
        facing: 'right',
        currentOrderId: 'ORD-101',
        hasPayload: false,
        deliveries: 0,
        yielding: false,
      },
      {
        id: 'R2',
        name: 'Titan-02',
        color: '#0284C7',
        badgeBg: 'bg-[#0284C7]',
        x: 6,
        y: 3,
        target: { x: 6, y: 4 },
        path: [],
        status: 'packing',
        battery: 90,
        facing: 'down',
        currentOrderId: 'ORD-102',
        hasPayload: true,
        deliveries: 0,
        yielding: false,
      },
      {
        id: 'R3',
        name: 'Valkyrie-03',
        color: '#7C3AED',
        badgeBg: 'bg-[#7C3AED]',
        x: 14,
        y: 5,
        target: { x: 14, y: 8 },
        path: [],
        status: 'delivering',
        battery: 85,
        facing: 'down',
        currentOrderId: 'ORD-103',
        hasPayload: true,
        deliveries: 0,
        yielding: false,
      },
      {
        id: 'R4',
        name: 'Hermes-04',
        color: '#1E8E3E',
        badgeBg: 'bg-[#1E8E3E]',
        x: 1,
        y: 9,
        target: { x: 1, y: 9 },
        path: [],
        status: 'charging',
        battery: 98,
        facing: 'up',
        currentOrderId: null,
        hasPayload: false,
        deliveries: 0,
        yielding: false,
      },
    ]);
    sfx.playBlip(440, 0.1);
  };

  // Map Tile Paint Handler
  const handleTileClick = (x: number, y: number) => {
    const key = `${x},${y}`;
    setGridTiles(prev => {
      const next = { ...prev };
      if (paintTool === 'aisle') {
        delete next[key];
      } else {
        next[key] = paintTool;
      }
      return next;
    });
    sfx.playBlip(320, 0.03);
  };

  const handleTileMouseEnter = (x: number, y: number) => {
    if (!isMouseDown) return;
    handleTileClick(x, y);
  };

  const selectedRobot = useMemo(() => {
    return robots.find(r => r.id === selectedRobotId) || robots[0];
  }, [robots, selectedRobotId]);

  // Model Persistence (Exact Schema Preserved)
  const handleExportModel = () => {
    const modelData = {
      q_table: qTable,
      actions: ACTIONS,
      goal: selectedRobot.target ? [selectedRobot.target.x, selectedRobot.target.y] : [14, 8],
      step_reward: hyperparams.step_reward,
      goal_reward: hyperparams.goal_reward,
      discount_factor: hyperparams.discount_factor,
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(modelData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `roboware_model_${selectedRobot.id.toLowerCase()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    sfx.playBlip(750, 0.08);
  };

  const handleImportModel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.q_table && Array.isArray(json.q_table)) {
          setQTable(json.q_table);
        }
        if (typeof json.discount_factor === 'number') {
          setHyperparams(prev => ({
            ...prev,
            discount_factor: json.discount_factor,
            step_reward: json.step_reward ?? prev.step_reward,
            goal_reward: json.goal_reward ?? prev.goal_reward,
          }));
        }
        sfx.playChime();
      } catch (err) {
        console.error('Failed to parse model JSON', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Current robot's Q-values at its current location
  const currentQValues = useMemo(() => {
    const s = stateIndex(selectedRobot.x, selectedRobot.y);
    return qTable[s] || [0, 0, 0, 0];
  }, [qTable, selectedRobot.x, selectedRobot.y]);

  const maxQAction = useMemo(() => {
    const maxVal = Math.max(...currentQValues);
    if (maxVal === 0) return null;
    const idx = currentQValues.indexOf(maxVal);
    return ACTIONS[idx];
  }, [currentQValues]);

  // Center percentage in grid
  const getCellCenter = (col: number, row: number) => {
    const xPct = ((col + 0.5) / GRID_COLS) * 100;
    const yPct = ((row + 0.5) / GRID_ROWS) * 100;
    return { x: xPct, y: yPct };
  };

  // Human-readable next action explanation
  const getTurnInstruction = (robot: Robot) => {
    if (robot.status === 'charging') return 'Connected to EV Charging Bay · Replenishing Battery';
    if (robot.status === 'idle') return 'Stationary · Ready for next dispatch assignment';
    if (robot.yielding) return 'Yielding right-of-way to avoid intersection bottleneck';
    if (!robot.target) return 'En route · Calculating optimal trajectory';
    
    const dist = Math.abs(robot.x - robot.target.x) + Math.abs(robot.y - robot.target.y);
    const targetTile = gridTiles[`${robot.target.x},${robot.target.y}`];
    let destName = 'Destination';
    if (targetTile === 'pick') destName = 'Picking Station';
    else if (targetTile === 'pack') destName = 'Packing Hub';
    else if (targetTile === 'delivery') destName = 'Outbound Dock';
    else if (targetTile === 'charge') destName = 'Charging Bay';

    if (dist === 0) return `Arrived at ${destName} [${coordLabel(robot.target)}]`;
    return `In ${dist} cell${dist > 1 ? 's' : ''}, arrive at ${destName} [${coordLabel(robot.target)}]`;
  };

  return (
    <div
      className="relative w-screen h-screen bg-[#F1F3F4] overflow-hidden select-none flex flex-col justify-between font-sans text-[#202124]"
      onMouseDown={() => setIsMouseDown(true)}
      onMouseUp={() => setIsMouseDown(false)}
    >
      {/* Hidden file input for Model Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportModel}
        accept=".json"
        className="hidden"
      />

      {/* ==========================================
          GOOGLE MAPS CANVAS BACKGROUND (100vw x 100vh)
          Subtle street grid and warehouse footprint textures
          ========================================== */}
      <div className="absolute inset-0 pointer-events-none opacity-60">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="gmapsMinorGrid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#E2E5E9" strokeWidth="0.8" />
            </pattern>
            <pattern id="gmapsMajorGrid" width="160" height="160" patternUnits="userSpaceOnUse">
              <rect width="160" height="160" fill="url(#gmapsMinorGrid)" />
              <path d="M 160 0 L 0 0 0 160" fill="none" stroke="#D3D7DC" strokeWidth="1.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#gmapsMajorGrid)" />
        </svg>
      </div>

      {/* ==========================================
          CENTERED WAREHOUSE MAP FLOOR (16x10)
          ========================================== */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-6 md:p-12 overflow-hidden">
        <div
          style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}
          className="relative w-full max-w-6xl aspect-[16/10] bg-[#FFFFFF] rounded-2xl gmaps-card p-4 md:p-6 flex flex-col border border-[#DADCE0]"
        >
          {/* Top Column Labels (A–P) */}
          {showCoords && (
            <div className="grid grid-cols-16 text-center text-[10px] md:text-xs font-mono font-medium text-[#70757A] mb-2 tracking-wider">
              {Array.from({ length: GRID_COLS }).map((_, i) => (
                <div key={i}>{colLetter(i)}</div>
              ))}
            </div>
          )}

          {/* Main Grid Floor */}
          <div className="relative flex-1 flex">
            {/* Left Row Labels (1–10) */}
            {showCoords && (
              <div className="flex flex-col justify-around text-right text-[10px] md:text-xs font-mono font-medium text-[#70757A] mr-2 pr-1">
                {Array.from({ length: GRID_ROWS }).map((_, i) => (
                  <div key={i} className="flex items-center justify-end h-[10%]">
                    {i + 1}
                  </div>
                ))}
              </div>
            )}

            {/* Interactive Grid Tile Canvas */}
            <div className="relative flex-1 grid grid-cols-16 grid-rows-10 gap-1 md:gap-1.5 p-1.5 bg-[#F8F9FA] rounded-xl border border-[#DADCE0] overflow-hidden">
              {/* Tile Cells */}
              {Array.from({ length: GRID_ROWS }).map((_, r) =>
                Array.from({ length: GRID_COLS }).map((_, c) => {
                  const key = `${c},${r}`;
                  const tileType = gridTiles[key] || 'aisle';
                  const sIdx = stateIndex(c, r);
                  const qScores = qTable[sIdx] || [0, 0, 0, 0];
                  const maxQ = Math.max(...qScores);

                  const heatmapOpacity = showQHeatmap
                    ? Math.min(0.65, Math.max(0, maxQ / 12))
                    : 0;

                  return (
                    <div
                      key={key}
                      onClick={() => handleTileClick(c, r)}
                      onMouseEnter={() => handleTileMouseEnter(c, r)}
                      className={`relative rounded-md cursor-pointer transition-all duration-150 flex items-center justify-center group overflow-hidden ${
                        tileType === 'rack'
                          ? 'gmaps-rack'
                          : tileType === 'pick'
                          ? 'bg-[#FFF7ED] border border-[#FDBA74] text-[#EA580C]'
                          : tileType === 'pack'
                          ? 'bg-[#EFF6FF] border border-[#93C5FD] text-[#1A73E8]'
                          : tileType === 'delivery'
                          ? 'bg-[#F0FDF4] border border-[#86EFAC] text-[#1E8E3E]'
                          : tileType === 'charge'
                          ? 'bg-[#FEFCE8] border border-[#FDE047] text-[#D97706]'
                          : 'bg-[#FFFFFF] hover:bg-[#F1F3F4] border border-[#E8EAED]'
                      }`}
                      title={`${coordLabel({ x: c, y: r })}: ${tileType.toUpperCase()}`}
                    >
                      {/* Q-Value Heatmap Overlay */}
                      {showQHeatmap && tileType !== 'rack' && maxQ > 0 && (
                        <div
                          className="absolute inset-0 bg-[#34A853] pointer-events-none transition-opacity"
                          style={{ opacity: heatmapOpacity }}
                        />
                      )}

                      {/* Storage Rack Building Footprint Texture */}
                      {tileType === 'rack' && (
                        <div className="w-full h-full flex flex-col justify-between p-1 pointer-events-none">
                          <div className="flex justify-between items-center text-[7px] font-mono text-[#70757A] px-0.5">
                            <span>BAY</span>
                            <span>{colLetter(c)}{r+1}</span>
                          </div>
                          <div className="space-y-0.5">
                            <div className="h-0.5 bg-[#BDC1C6] rounded-full"></div>
                            <div className="h-0.5 bg-[#BDC1C6] rounded-full"></div>
                          </div>
                        </div>
                      )}

                      {/* Google Maps Styled POI Badges */}
                      {tileType === 'pick' && (
                        <div className="flex flex-col items-center justify-center pointer-events-none">
                          <div className="w-5 h-5 rounded-full bg-[#EA580C] text-white flex items-center justify-center shadow-xs">
                            <Box className="w-3 h-3" />
                          </div>
                          <span className="text-[7px] font-semibold text-[#EA580C] mt-0.5 leading-none">Pick</span>
                        </div>
                      )}

                      {tileType === 'pack' && (
                        <div className="flex flex-col items-center justify-center pointer-events-none">
                          <div className="w-5 h-5 rounded-full bg-[#1A73E8] text-white flex items-center justify-center shadow-xs">
                            <PackageCheck className="w-3 h-3" />
                          </div>
                          <span className="text-[7px] font-semibold text-[#1A73E8] mt-0.5 leading-none">Pack</span>
                        </div>
                      )}

                      {tileType === 'delivery' && (
                        <div className="flex flex-col items-center justify-center pointer-events-none">
                          <div className="w-5 h-5 rounded-full bg-[#1E8E3E] text-white flex items-center justify-center shadow-xs">
                            <Truck className="w-3 h-3" />
                          </div>
                          <span className="text-[7px] font-semibold text-[#1E8E3E] mt-0.5 leading-none">Dock</span>
                        </div>
                      )}

                      {tileType === 'charge' && (
                        <div className="flex flex-col items-center justify-center pointer-events-none">
                          <div className="w-5 h-5 rounded-full bg-[#F59E0B] text-white flex items-center justify-center shadow-xs">
                            <Zap className="w-3 h-3" />
                          </div>
                          <span className="text-[7px] font-semibold text-[#B45309] mt-0.5 leading-none">EV</span>
                        </div>
                      )}

                      {/* Road Centerline on Aisles (Google Street Look) */}
                      {tileType === 'aisle' && (
                        <span className="text-[8px] font-mono text-[#BDC1C6] opacity-0 group-hover:opacity-100 transition-opacity">
                          {colLetter(c)}{r + 1}
                        </span>
                      )}
                    </div>
                  );
                })
              )}

              {/* ==========================================
                  SVG OVERLAY: GOOGLE MAPS NAVIGATION ROUTES & DESTINATIONS
                  ========================================== */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none z-20"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {showPaths &&
                  robots.map(robot => {
                    if (robot.path.length === 0) return null;
                    const points = [
                      getCellCenter(robot.x, robot.y),
                      ...robot.path.map(p => getCellCenter(p.x, p.y)),
                    ];

                    const dPath = points.reduce((acc, pt, idx) => {
                      return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
                    }, '');

                    const isTrafficDelay = robot.yielding;

                    return (
                      <g key={`path-${robot.id}`}>
                        {/* Route background casing (Google Maps route white shadow) */}
                        <path
                          d={dPath}
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth="3.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeOpacity="0.9"
                        />
                        {/* Google Maps Blue Route Line (Turns Amber/Red on Traffic Delays) */}
                        <path
                          d={dPath}
                          fill="none"
                          stroke={isTrafficDelay ? '#EA4335' : robot.color}
                          strokeWidth="2.0"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeOpacity="0.85"
                          className={isTrafficDelay ? 'gmaps-walking-route' : ''}
                        />

                        {/* Google Maps Destination Pin Teardrop Marker */}
                        {points.length > 1 && (
                          <g transform={`translate(${points[points.length - 1].x}, ${points[points.length - 1].y})`}>
                            <circle r="1.8" fill="#FFFFFF" stroke={robot.color} strokeWidth="0.8" />
                            <circle r="0.9" fill={robot.color} />
                          </g>
                        )}
                      </g>
                    );
                  })}

                {/* Google Maps Traffic Yield Warning */}
                {showCollisionZones &&
                  robots
                    .filter(r => r.yielding)
                    .map(r => {
                      const center = getCellCenter(r.x, r.y);
                      return (
                        <g key={`yield-${r.id}`}>
                          <circle
                            cx={center.x}
                            cy={center.y}
                            r="3.2"
                            fill="none"
                            stroke="#EA4335"
                            strokeWidth="0.8"
                            strokeDasharray="1.5 1.5"
                            className="animate-spin origin-center"
                          />
                          <circle
                            cx={center.x}
                            cy={center.y}
                            r="1.8"
                            fill="#EA4335"
                            fillOpacity="0.2"
                          />
                        </g>
                      );
                    })}
              </svg>

              {/* ==========================================
                  GOOGLE MAPS NAVIGATION BLUE DOTS / AGENT PUCKS
                  ========================================== */}
              {robots.map(robot => {
                const isSelected = selectedRobotId === robot.id;
                const leftPct = (robot.x / GRID_COLS) * 100;
                const topPct = (robot.y / GRID_ROWS) * 100;
                const widthPct = (1 / GRID_COLS) * 100;
                const heightPct = (1 / GRID_ROWS) * 100;

                const noseRot =
                  robot.facing === 'up'
                    ? -90
                    : robot.facing === 'down'
                    ? 90
                    : robot.facing === 'left'
                    ? 180
                    : 0;

                return (
                  <div
                    key={robot.id}
                    onClick={e => {
                      e.stopPropagation();
                      setSelectedRobotId(robot.id);
                      setIsInspectorOpen(true);
                      sfx.playBlip(600, 0.05);
                    }}
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: `${widthPct}%`,
                      height: `${heightPct}%`,
                    }}
                    className="absolute z-30 p-1 transition-all duration-300 ease-out cursor-pointer group"
                  >
                    {/* Directional Light Cone Beam (Google Maps GPS Heading Cone) */}
                    <div
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      style={{ transform: `rotate(${noseRot}deg)` }}
                    >
                      <div
                        className="w-12 h-12 origin-center -mr-7 opacity-35"
                        style={{
                          background: `radial-gradient(ellipse at left center, ${robot.color} 0%, transparent 70%)`,
                          clipPath: 'polygon(0% 40%, 100% 0%, 100% 100%, 0% 60%)',
                        }}
                      />
                    </div>

                    {/* Google Maps Blue Location Puck */}
                    <div
                      className={`w-full h-full rounded-full bg-white flex items-center justify-center relative transition-transform duration-200 border-2 border-white shadow-md ${
                        isSelected ? 'ring-2 ring-[#1A73E8] scale-110 z-40' : 'hover:scale-105'
                      }`}
                    >
                      {/* Pulse Ring when Active */}
                      {isPlaying && (
                        <div
                          className="absolute inset-0 rounded-full gmaps-gps-pulse pointer-events-none"
                          style={{ backgroundColor: robot.color }}
                        />
                      )}

                      {/* Inner Dot with Agent Identity */}
                      <div
                        className="w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center text-[9px] md:text-[10px] font-bold text-white shadow-xs"
                        style={{ backgroundColor: robot.color }}
                      >
                        {robot.id}
                      </div>

                      {/* Directional Chevron Nose */}
                      <div
                        className="absolute inset-0 flex items-center justify-end pr-0.5 pointer-events-none"
                        style={{ transform: `rotate(${noseRot}deg)` }}
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full border border-white"
                          style={{ backgroundColor: robot.color }}
                        />
                      </div>

                      {/* Yield Alert Flag */}
                      {robot.yielding && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#EA4335] text-white rounded-full flex items-center justify-center text-[8px] font-bold border border-white">
                          !
                        </div>
                      )}

                      {/* Payload Icon */}
                      {robot.hasPayload && (
                        <div className="absolute -bottom-1 -right-1 bg-[#1A73E8] text-white rounded-full p-0.5 border border-white shadow-xs">
                          <Box className="w-2.5 h-2.5" />
                        </div>
                      )}

                      {/* Google Maps Hover Tag */}
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#202124] text-white text-[9px] px-1.5 py-0.5 rounded shadow whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        {robot.name} ({robot.battery}%)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* ==========================================
          TOP-LEFT: GOOGLE MAPS SEARCH BAR & CATEGORY CHIPS
          ========================================== */}
      <header className="absolute top-5 left-5 z-40 flex flex-col gap-2.5 max-w-xl">
        {/* Google Maps Search Bar Card */}
        <div className="bg-white rounded-full gmaps-card px-4 py-2 flex items-center gap-3 w-[460px] max-w-full">
          {/* Google 4-Color Pin Logo */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-8 h-8 rounded-full bg-[#1A73E8]/10 flex items-center justify-center text-[#1A73E8]">
              <MapPin className="w-4 h-4 fill-[#1A73E8]" />
            </div>
          </div>

          {/* Search Input / Fleet Mode */}
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#202124] leading-tight">
                RoboWare Fleet
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#E8F0FE] text-[#1A73E8] rounded font-medium">
                Tick #{tick.toString().padStart(4, '0')}
              </span>
            </div>
            <input
              type="text"
              placeholder="Search aisle (e.g. B2), agent (R1), or SKU..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="text-xs text-[#5F6368] bg-transparent outline-none placeholder:text-[#80868B] w-full"
            />
          </div>

          {/* Algorithm Mode Trigger */}
          <div className="flex items-center gap-1 border-l border-[#DADCE0] pl-2">
            <button
              onClick={() => {
                const nextMode: SimulationMode =
                  mode === 'hybrid' ? 'pure_astar' : mode === 'pure_astar' ? 'q_learning' : 'hybrid';
                setMode(nextMode);
                sfx.playBlip(540, 0.03);
              }}
              title="Click to cycle navigation algorithm"
              className="text-xs font-medium text-[#1A73E8] hover:bg-[#F1F3F4] px-2 py-1 rounded-md transition-colors whitespace-nowrap"
            >
              {mode === 'hybrid' ? 'Hybrid AI' : mode === 'pure_astar' ? 'Pure A*' : 'Q-Policy'}
            </button>
          </div>

          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(v => !v)}
            title={soundEnabled ? 'Mute Navigation Audio' : 'Unmute Audio'}
            className="w-7 h-7 rounded-full text-[#5F6368] hover:bg-[#F1F3F4] flex items-center justify-center transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-[#EA4335]" />}
          </button>
        </div>

        {/* Google Maps Style Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 text-xs text-[#3C4043]">
          <button
            onClick={() => setShowPaths(v => !v)}
            className={`px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 whitespace-nowrap shadow-xs ${
              showPaths
                ? 'bg-[#E8F0FE] border-[#1A73E8] text-[#1A73E8] font-medium'
                : 'bg-white border-[#DADCE0] hover:bg-[#F8F9FA]'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            <span>Routes</span>
          </button>

          <button
            onClick={() => setShowQHeatmap(v => !v)}
            className={`px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 whitespace-nowrap shadow-xs ${
              showQHeatmap
                ? 'bg-[#E6F4EA] border-[#1E8E3E] text-[#1E8E3E] font-medium'
                : 'bg-white border-[#DADCE0] hover:bg-[#F8F9FA]'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Q-Heatmap</span>
          </button>

          <button
            onClick={() => setShowCollisionZones(v => !v)}
            className={`px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 whitespace-nowrap shadow-xs ${
              showCollisionZones
                ? 'bg-[#FCE8E6] border-[#EA4335] text-[#EA4335] font-medium'
                : 'bg-white border-[#DADCE0] hover:bg-[#F8F9FA]'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Traffic Delays</span>
          </button>

          <button
            onClick={() => setShowCoords(v => !v)}
            className={`px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 whitespace-nowrap shadow-xs ${
              showCoords
                ? 'bg-[#E8F0FE] border-[#1A73E8] text-[#1A73E8] font-medium'
                : 'bg-white border-[#DADCE0] hover:bg-[#F8F9FA]'
            }`}
          >
            <span className="font-mono text-[11px] font-bold">A1</span>
            <span>Aisle Grid</span>
          </button>

          <button
            onClick={() => setIsInspectorOpen(v => !v)}
            className={`px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 whitespace-nowrap shadow-xs ${
              isInspectorOpen
                ? 'bg-[#E8F0FE] border-[#1A73E8] text-[#1A73E8] font-medium'
                : 'bg-white border-[#DADCE0] hover:bg-[#F8F9FA]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>AI Brain Inspector</span>
          </button>
        </div>
      </header>

      {/* ==========================================
          TOP-RIGHT: LIVE FLEET DISPATCH & TELEMETRY
          ========================================== */}
      <aside className="absolute top-5 right-5 z-40 flex flex-col items-end gap-3 max-w-sm">
        {/* KPI Strip (Google Maps Style Quick Stats) */}
        <div className="bg-white rounded-full gmaps-card px-3.5 py-1.5 flex items-center gap-4 text-xs font-medium">
          {/* Deliveries */}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#1E8E3E]"></span>
            <span className="text-[#5F6368]">Delivered</span>
            <span className="font-bold text-[#202124] tabular-nums">{deliveriesCompleted}</span>
          </div>

          <div className="w-px h-4 bg-[#DADCE0]"></div>

          {/* Traffic Delays */}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#FBBC04]"></span>
            <span className="text-[#5F6368]">Yielding</span>
            <span className="font-bold text-[#202124] tabular-nums">{activeYieldCount}</span>
          </div>

          <div className="w-px h-4 bg-[#DADCE0]"></div>

          {/* EV Charging */}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#1A73E8]"></span>
            <span className="text-[#5F6368]">Chargers</span>
            <span className="font-bold text-[#202124] tabular-nums">{occupiedChargers}/{chargerDocks.length}</span>
          </div>

          <button
            onClick={() => setIsOrdersDrawerOpen(v => !v)}
            title="Toggle Fleet Itinerary Drawer"
            className="w-6 h-6 rounded-full hover:bg-[#F1F3F4] flex items-center justify-center text-[#5F6368] ml-1 transition-transform"
          >
            <ChevronRight
              className={`w-4 h-4 transition-transform duration-200 ${
                isOrdersDrawerOpen ? 'rotate-90' : ''
              }`}
            />
          </button>
        </div>

        {/* Live Orders Drawer (Google Maps Trip Stops Itinerary) */}
        {isOrdersDrawerOpen && (
          <div className="w-84 bg-white rounded-2xl gmaps-card p-4 flex flex-col gap-3 max-h-[440px]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#202124]">Fleet Trip Itinerary</h3>
                <p className="text-[11px] text-[#5F6368]">
                  {orders.filter(o => o.stage !== 'completed').length} active fulfillment tasks
                </p>
              </div>
              <button
                onClick={handleDispatchOrder}
                className="gmaps-btn-primary px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Dispatch</span>
              </button>
            </div>

            {/* Continuous stream toggle */}
            <div className="flex items-center justify-between py-1.5 px-3 bg-[#F8F9FA] rounded-xl text-xs text-[#5F6368]">
              <span>Continuous Dispatch Stream</span>
              <button
                onClick={() => setAutoDispatch(v => !v)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold transition-colors ${
                  autoDispatch ? 'bg-[#1E8E3E] text-white' : 'bg-[#DADCE0] text-[#5F6368]'
                }`}
              >
                {autoDispatch ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Orders list */}
            <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-1 max-h-[290px]">
              {orders.map(order => {
                const assignedRobot = robots.find(r => r.id === order.assignedRobotId);

                return (
                  <div
                    key={order.id}
                    className="p-3 bg-white rounded-xl border border-[#DADCE0] hover:border-[#1A73E8]/50 transition-colors shadow-xs flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-[#202124]">{order.id}</span>
                        {order.priority === 'express' && (
                          <span className="text-[9px] font-semibold text-[#C5221F] bg-[#FCE8E6] px-1.5 py-0.5 rounded-full">
                            Express
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-[#5F6368]">{order.sku}</span>
                    </div>

                    <div className="text-xs text-[#3C4043] font-medium truncate">{order.skuName}</div>

                    {/* Itinerary Waypoints: Pick -> Pack -> Drop */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#5F6368] pt-1 border-t border-[#F1F3F4]">
                      <span className={order.stage === 'picking' ? 'font-bold text-[#EA580C]' : ''}>
                        ● {coordLabel(order.pickLocation)}
                      </span>
                      <span className="text-[#BDC1C6]">───</span>
                      <span className={order.stage === 'packing' ? 'font-bold text-[#1A73E8]' : ''}>
                        ○ {coordLabel(order.packLocation)}
                      </span>
                      <span className="text-[#BDC1C6]">───</span>
                      <span className={order.stage === 'delivering' ? 'font-bold text-[#1E8E3E]' : ''}>
                        ◆ {coordLabel(order.deliveryLocation)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-[#70757A] capitalize">Status: {order.stage}</span>
                      {assignedRobot ? (
                        <span
                          className="font-medium px-2 py-0.5 rounded-full text-white text-[10px]"
                          style={{ backgroundColor: assignedRobot.color }}
                        >
                          {assignedRobot.name}
                        </span>
                      ) : (
                        <span className="text-[#70757A] italic text-[10px]">Awaiting Agent</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </aside>

      {/* ==========================================
          BOTTOM-LEFT: GOOGLE MAPS LAYERS & FLOOR EDITOR
          ========================================== */}
      <aside className="absolute bottom-6 left-6 z-40 flex flex-col gap-2">
        {showLayersMenu ? (
          <div className="bg-white rounded-2xl gmaps-card p-3.5 flex flex-col gap-2.5 w-76">
            <div className="flex items-center justify-between pb-1 border-b border-[#DADCE0]">
              <span className="text-xs font-semibold text-[#202124]">Warehouse Floor Map Editor</span>
              <button
                onClick={() => setShowLayersMenu(false)}
                className="w-5 h-5 rounded-full hover:bg-[#F1F3F4] flex items-center justify-center text-[#5F6368]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setPaintTool('rack')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all ${
                  paintTool === 'rack'
                    ? 'bg-[#F1F3F4] border-[#1A73E8] text-[#1A73E8] font-semibold'
                    : 'bg-white border-[#DADCE0] text-[#3C4043]'
                }`}
              >
                <div className="w-3 h-3 rounded bg-[#BDC1C6]" />
                <span>Storage Rack</span>
              </button>

              <button
                onClick={() => setPaintTool('pick')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all ${
                  paintTool === 'pick'
                    ? 'bg-[#FFF7ED] border-[#EA580C] text-[#EA580C] font-semibold'
                    : 'bg-white border-[#DADCE0] text-[#3C4043]'
                }`}
              >
                <Box className="w-3.5 h-3.5 text-[#EA580C]" />
                <span>Pick Station</span>
              </button>

              <button
                onClick={() => setPaintTool('pack')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all ${
                  paintTool === 'pack'
                    ? 'bg-[#EFF6FF] border-[#1A73E8] text-[#1A73E8] font-semibold'
                    : 'bg-white border-[#DADCE0] text-[#3C4043]'
                }`}
              >
                <PackageCheck className="w-3.5 h-3.5 text-[#1A73E8]" />
                <span>Pack Station</span>
              </button>

              <button
                onClick={() => setPaintTool('delivery')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all ${
                  paintTool === 'delivery'
                    ? 'bg-[#F0FDF4] border-[#1E8E3E] text-[#1E8E3E] font-semibold'
                    : 'bg-white border-[#DADCE0] text-[#3C4043]'
                }`}
              >
                <Truck className="w-3.5 h-3.5 text-[#1E8E3E]" />
                <span>Outbound Dock</span>
              </button>

              <button
                onClick={() => setPaintTool('charge')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all ${
                  paintTool === 'charge'
                    ? 'bg-[#FEFCE8] border-[#D97706] text-[#D97706] font-semibold'
                    : 'bg-white border-[#DADCE0] text-[#3C4043]'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-[#D97706]" />
                <span>EV Charger</span>
              </button>

              <button
                onClick={() => setPaintTool('aisle')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all ${
                  paintTool === 'aisle'
                    ? 'bg-[#202124] text-white font-semibold'
                    : 'bg-white border-[#DADCE0] text-[#3C4043]'
                }`}
              >
                <span>Clear Aisle</span>
              </button>
            </div>

            <button
              onClick={() => {
                setGridTiles({ ...PRESET_DISTRIBUTION_HUB });
                sfx.playBlip(480, 0.05);
              }}
              className="mt-1 py-1.5 px-3 bg-[#F1F3F4] hover:bg-[#E8EAED] text-[#3C4043] rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset to Default Layout</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowLayersMenu(true)}
            className="bg-white rounded-full gmaps-card px-3.5 py-2 flex items-center gap-2 text-xs font-medium text-[#3C4043] hover:bg-[#F8F9FA] transition-colors"
          >
            <Layers className="w-4 h-4 text-[#1A73E8]" />
            <span>Map Layers & Editor</span>
          </button>
        )}
      </aside>

      {/* ==========================================
          BOTTOM-CENTER: GOOGLE MAPS NAVIGATION BANNER & PLAYBACK DOCK
          ========================================== */}
      <footer className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2">
        {/* Turn-by-Turn Directions Banner */}
        <div className="bg-white rounded-full gmaps-card px-4 py-2 flex items-center gap-3 shadow-md max-w-lg border border-[#DADCE0]">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 text-xs font-bold"
            style={{ backgroundColor: selectedRobot.color }}
          >
            {selectedRobot.id}
          </div>
          <div className="flex-1 flex flex-col">
            <span className="text-xs font-medium text-[#202124]">
              {getTurnInstruction(selectedRobot)}
            </span>
            <span className="text-[10px] text-[#5F6368]">
              {selectedRobot.name} · {Math.round(selectedRobot.battery)}% Battery · {selectedRobot.deliveries} completed
            </span>
          </div>

          <div className="w-px h-6 bg-[#DADCE0]"></div>

          {/* Google Play / Pause Button */}
          <button
            onClick={() => {
              setIsPlaying(p => !p);
              sfx.playBlip(isPlaying ? 380 : 580, 0.04);
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center text-white transition-colors ${
              isPlaying ? 'bg-[#202124] hover:bg-[#3C4043]' : 'gmaps-btn-primary'
            }`}
            title={isPlaying ? 'Pause Simulation' : 'Start Simulation'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          {/* Step Button */}
          <button
            onClick={() => {
              setIsPlaying(false);
              stepSimulation();
              sfx.playBlip(480, 0.03);
            }}
            className="w-8 h-8 rounded-full hover:bg-[#F1F3F4] text-[#3C4043] flex items-center justify-center transition-colors"
            title="Step Forward (+1 Tick)"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* Reset Button */}
          <button
            onClick={handleReset}
            className="w-8 h-8 rounded-full hover:bg-[#F1F3F4] text-[#3C4043] flex items-center justify-center transition-colors"
            title="Reset Simulation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Speed Selector (1x, 2x, 5x) */}
          <div className="flex items-center gap-0.5 bg-[#F1F3F4] p-0.5 rounded-full text-xs font-medium">
            {[1, 2, 5].map(spd => (
              <button
                key={spd}
                onClick={() => {
                  setSimSpeed(spd);
                  sfx.playBlip(440, 0.02);
                }}
                className={`px-2 py-0.5 rounded-full text-[11px] font-mono transition-colors ${
                  simSpeed === spd
                    ? 'bg-white text-[#1A73E8] font-bold shadow-xs'
                    : 'text-[#5F6368] hover:text-[#202124]'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </footer>

      {/* ==========================================
          BOTTOM-RIGHT: GOOGLE MAPS CONTROLS (+, -, COMPASS, RECENTER)
          ========================================== */}
      <div className="absolute bottom-6 right-6 z-40 flex flex-col items-center gap-2">
        {/* Zoom & Navigation Vertical Pill */}
        <div className="bg-white rounded-full gmaps-card p-1 flex flex-col items-center shadow-md">
          <button
            onClick={() => setZoomLevel(z => Math.min(1.3, z + 0.1))}
            title="Zoom In"
            className="w-8 h-8 rounded-full hover:bg-[#F1F3F4] text-[#3C4043] flex items-center justify-center transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-5 h-px bg-[#DADCE0]"></div>
          <button
            onClick={() => setZoomLevel(z => Math.max(0.7, z - 0.1))}
            title="Zoom Out"
            className="w-8 h-8 rounded-full hover:bg-[#F1F3F4] text-[#3C4043] flex items-center justify-center transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>

        {/* Recenter button */}
        <button
          onClick={() => {
            setZoomLevel(1);
            sfx.playBlip(500, 0.03);
          }}
          title="Recenter Map View"
          className="w-10 h-10 rounded-full bg-white gmaps-card flex items-center justify-center text-[#1A73E8] hover:bg-[#F8F9FA] shadow-md transition-colors"
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>

      {/* ==========================================
          SLIDE-OVER: HUMAN AI AGENT INTELLIGENCE CARD (Q-LEARNING INSPECTOR)
          ========================================== */}
      {isInspectorOpen && (
        <aside className="absolute top-20 right-5 z-50 w-92 bg-white rounded-2xl gmaps-card-raised p-4 flex flex-col gap-3 shadow-2xl border border-[#DADCE0] max-h-[85vh] overflow-y-auto custom-scrollbar">
          {/* Card Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[#DADCE0]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#202124]">Agent Intelligence</h3>
                <p className="text-[10px] text-[#5F6368]">Reinforcement Learning & Policy Inspection</p>
              </div>
            </div>
            <button
              onClick={() => setIsInspectorOpen(false)}
              className="w-6 h-6 rounded-full hover:bg-[#F1F3F4] text-[#5F6368] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Robot Selector Pill Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[#F1F3F4] rounded-xl text-xs">
            {robots.map(r => (
              <button
                key={r.id}
                onClick={() => {
                  setSelectedRobotId(r.id);
                  sfx.playBlip(550, 0.02);
                }}
                className={`flex-1 py-1 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
                  selectedRobotId === r.id
                    ? 'bg-white text-[#202124] shadow-xs font-semibold'
                    : 'text-[#5F6368] hover:text-[#202124]'
                }`}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                <span>{r.id}</span>
              </button>
            ))}
          </div>

          {/* Place Summary Box (Google Maps Place Card style) */}
          <div className="p-3 bg-[#F8F9FA] rounded-xl border border-[#E8EAED] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#202124]">{selectedRobot.name}</span>
              <span className="text-xs font-mono font-medium text-[#1A73E8]">
                [{coordLabel({ x: selectedRobot.x, y: selectedRobot.y })}]
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-[#70757A] block">Battery Health</span>
                <span className="font-medium text-[#202124] flex items-center gap-1">
                  <BatteryMedium className="w-3.5 h-3.5 text-[#1E8E3E]" />
                  {Math.round(selectedRobot.battery)}% (Nominal)
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#70757A] block">Task Status</span>
                <span className="font-medium capitalize text-[#202124]">
                  {selectedRobot.status}
                </span>
              </div>
            </div>

            <div className="text-xs border-t border-[#DADCE0] pt-2">
              <span className="text-[10px] text-[#70757A] block">Current Navigation Target</span>
              <span className="font-medium text-[#3C4043]">
                {selectedRobot.target
                  ? `${coordLabel(selectedRobot.target)} (${selectedRobot.target.x}, ${selectedRobot.target.y})`
                  : 'Awaiting Next Waypoint'}
              </span>
            </div>
          </div>

          {/* Human AI Explanation */}
          <div className="p-2.5 bg-[#E8F0FE] rounded-xl text-xs text-[#1A73E8] flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-[#174EA6]">
              {mode === 'hybrid'
                ? `A* pathfinding calculates shortest grid trajectory to the goal, while the Bellman Q-Learning policy adjusts step rewards and avoids congestion.`
                : mode === 'pure_astar'
                ? `Deterministic A* search algorithm routes along Manhattan distances around static rack obstacles.`
                : `Pure reinforcement learning agent navigates via learned state-action Q-values and epsilon exploration.`}
            </p>
          </div>

          {/* Learned Q-Scores Directional Pad */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#202124]">Action Values @ Current Cell</span>
              <span className="text-[10px] font-mono text-[#1E8E3E] font-medium">
                Best: {maxQAction ? maxQAction.toUpperCase() : 'NEUTRAL'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 bg-[#F1F3F4] p-2 rounded-xl text-center font-mono">
              <div />
              <div
                className={`p-1.5 rounded-lg text-xs border ${
                  maxQAction === 'up'
                    ? 'bg-[#E6F4EA] border-[#1E8E3E] text-[#137333] font-bold'
                    : 'bg-white border-[#DADCE0] text-[#3C4043]'
                }`}
              >
                <div className="text-[9px] text-[#70757A]">▲ NORTH</div>
                <div>{currentQValues[0]?.toFixed(2)}</div>
              </div>
              <div />

              <div
                className={`p-1.5 rounded-lg text-xs border ${
                  maxQAction === 'left'
                    ? 'bg-[#E6F4EA] border-[#1E8E3E] text-[#137333] font-bold'
                    : 'bg-white border-[#DADCE0] text-[#3C4043]'
                }`}
              >
                <div className="text-[9px] text-[#70757A]">◀ WEST</div>
                <div>{currentQValues[2]?.toFixed(2)}</div>
              </div>

              <div className="flex items-center justify-center text-xs font-semibold text-[#70757A]">
                {coordLabel({ x: selectedRobot.x, y: selectedRobot.y })}
              </div>

              <div
                className={`p-1.5 rounded-lg text-xs border ${
                  maxQAction === 'right'
                    ? 'bg-[#E6F4EA] border-[#1E8E3E] text-[#137333] font-bold'
                    : 'bg-white border-[#DADCE0] text-[#3C4043]'
                }`}
              >
                <div className="text-[9px] text-[#70757A]">EAST ▶</div>
                <div>{currentQValues[3]?.toFixed(2)}</div>
              </div>

              <div />
              <div
                className={`p-1.5 rounded-lg text-xs border ${
                  maxQAction === 'down'
                    ? 'bg-[#E6F4EA] border-[#1E8E3E] text-[#137333] font-bold'
                    : 'bg-white border-[#DADCE0] text-[#3C4043]'
                }`}
              >
                <div className="text-[9px] text-[#70757A]">▼ SOUTH</div>
                <div>{currentQValues[1]?.toFixed(2)}</div>
              </div>
              <div />
            </div>
          </div>

          {/* Hyperparameters */}
          <div className="flex flex-col gap-2 pt-2 border-t border-[#DADCE0]">
            <div className="flex items-center justify-between text-xs font-semibold text-[#202124]">
              <span className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#1A73E8]" />
                RL Hyperparameters
              </span>
              <span className="text-[10px] font-mono text-[#70757A]">Bellman EQ</span>
            </div>

            {/* Learning Rate */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-[#5F6368]">
                <span>Learning Rate (α)</span>
                <span className="font-mono font-semibold text-[#202124]">{hyperparams.learning_rate}</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.5"
                step="0.01"
                value={hyperparams.learning_rate}
                onChange={e =>
                  setHyperparams(prev => ({
                    ...prev,
                    learning_rate: parseFloat(e.target.value),
                  }))
                }
                className="w-full accent-[#1A73E8] h-1.5 bg-[#E8EAED] rounded-lg cursor-pointer"
              />
            </div>

            {/* Discount Factor */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-[#5F6368]">
                <span>Discount Factor (γ)</span>
                <span className="font-mono font-semibold text-[#202124]">{hyperparams.discount_factor}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="0.99"
                step="0.01"
                value={hyperparams.discount_factor}
                onChange={e =>
                  setHyperparams(prev => ({
                    ...prev,
                    discount_factor: parseFloat(e.target.value),
                  }))
                }
                className="w-full accent-[#1A73E8] h-1.5 bg-[#E8EAED] rounded-lg cursor-pointer"
              />
            </div>

            {/* Exploration Rate */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-[#5F6368]">
                <span>Exploration Rate (ε)</span>
                <span className="font-mono font-semibold text-[#202124]">{hyperparams.exploration_rate}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.8"
                step="0.05"
                value={hyperparams.exploration_rate}
                onChange={e =>
                  setHyperparams(prev => ({
                    ...prev,
                    exploration_rate: parseFloat(e.target.value),
                  }))
                }
                className="w-full accent-[#1A73E8] h-1.5 bg-[#E8EAED] rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Model Persistence (Exact Schema preserved) */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#DADCE0]">
            <button
              onClick={handleExportModel}
              className="gmaps-btn py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-[#1A73E8]" />
              <span>Export Model</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="gmaps-btn py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5 text-[#1A73E8]" />
              <span>Import Model</span>
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
