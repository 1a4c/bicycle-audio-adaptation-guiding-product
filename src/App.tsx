import { useState, useEffect, useRef, useCallback } from "react";
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Send,
  Play,
  Pause,
  RotateCcw,
  Compass,
  MapPin,
  Activity,
  Gauge,
  Wind,
  Navigation,
  TrendingUp,
  Sparkles,
  Cpu,
  Layers,
  AlertTriangle,
  RotateCw,
  Clock,
  Zap,
  Info,
  Smartphone
} from "lucide-react";
import { Message, PresetRoute, SuggestedStop, MetricsAdjustment, AssistantResponse } from "./types";

// Declare Leaflet global variable so TypeScript doesn't complain
declare const L: any;

// Preset routes matching the backend
const PRESETS = {
  scenic: {
    name: "淡水河畔休閒車道 (Tamsui Riverfront Leisure Trail)",
    distance: "18.2 km",
    elevationGain: "45 m",
    avgSlope: "0.8%",
    windCoef: "0.32 CdA",
    description: "沿著淡水河畔的休濱自行車道，風景優美，路面平坦，非常適合休閒與夜騎。",
    waypoints: [
      { name: "大稻埕碼頭", lat: 25.0562, lng: 121.5074 },
      { name: "社子島濕地", lat: 25.1098, lng: 121.4912 },
      { name: "關渡宮補給站", lat: 25.1176, lng: 121.4632 },
      { name: "淡水老街終點", lat: 25.1699, lng: 121.4442 }
    ]
  },
  fastest: {
    name: "大佳綠能公路段 (Dajia Green High-Speed Segment)",
    distance: "12.5 km",
    elevationGain: "20 m",
    avgSlope: "0.2%",
    windCoef: "0.42 CdA",
    description: "封閉式的筆直綠能路段，無紅綠燈干擾，適合進行高速巡航與踏頻耐力訓練。",
    waypoints: [
      { name: "圓山花博起點", lat: 25.0712, lng: 121.5218 },
      { name: "大佳河濱公園", lat: 25.0754, lng: 121.5422 },
      { name: "迎風運動公園", lat: 25.0682, lng: 121.5645 },
      { name: "美堤碼頭終點", lat: 25.0789, lng: 121.5598 }
    ]
  },
  flat: {
    name: "雙溪生活水岸車道 (Shuangxi Riverside Quiet Route)",
    distance: "9.8 km",
    elevationGain: "35 m",
    avgSlope: "0.4%",
    windCoef: "0.26 CdA",
    description: "沿著雙溪溪畔的靜謐車道，兩側有樹蔭遮蔽，風阻極低，適合輕鬆騎乘與恢復訓練。",
    waypoints: [
      { name: "至善公園起點", lat: 25.0988, lng: 121.5492 },
      { name: "士林橋補給點", lat: 25.0934, lng: 121.5262 },
      { name: "兒童新樂園", lat: 25.0968, lng: 121.5144 },
      { name: "洲美橋終點", lat: 25.1022, lng: 121.5032 }
    ]
  },
  mountain: {
    name: "陽明山經典爬坡挑戰 (Yangmingshan Hillclimb Challenge)",
    distance: "15.4 km",
    elevationGain: "780 m",
    avgSlope: "6.5%",
    windCoef: "0.52 CdA",
    description: "高難度的經典山路爬坡路線，沿途坡度起伏大，適合進階車友進行大腿力量與耐爬升訓練。",
    waypoints: [
      { name: "士林捷運站起點", lat: 25.0932, lng: 121.5263 },
      { name: "仰德大道入口", lat: 25.0978, lng: 121.5368 },
      { name: "文化大學補給站", lat: 25.1362, lng: 121.5412 },
      { name: "冷水坑服務區終點", lat: 25.1662, lng: 121.5622 }
    ]
  }
};

// Generate 100 smooth coordinates along waypoints
function interpolateRoute(waypoints: { lat: number; lng: number }[], steps: number = 100) {
  if (waypoints.length < 2) return [];
  const routePoints: { lat: number; lng: number }[] = [];
  const segmentsCount = waypoints.length - 1;
  const stepsPerSegment = Math.floor(steps / segmentsCount);

  for (let i = 0; i < segmentsCount; i++) {
    const start = waypoints[i];
    const end = waypoints[i + 1];
    const currentSegmentSteps = i === segmentsCount - 1 ? steps - routePoints.length : stepsPerSegment;

    for (let j = 0; j < currentSegmentSteps; j++) {
      const t = j / currentSegmentSteps;
      routePoints.push({
        lat: start.lat + (end.lat - start.lat) * t,
        lng: start.lng + (end.lng - start.lng) * t,
      });
    }
  }
  return routePoints;
}

// Generate elevation profile corresponding to route points
function generateElevations(presetKey: string, size: number = 100): number[] {
  const elevations: number[] = [];
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    if (presetKey === "mountain") {
      // Climbs from 20m up to 780m
      elevations.push(Math.round(20 + Math.pow(t, 1.8) * 740 + Math.sin(t * Math.PI * 6) * 15));
    } else if (presetKey === "scenic") {
      // Fluctuate slightly near water level (15m - 28m)
      elevations.push(Math.round(15 + Math.sin(t * Math.PI * 4) * 6 + Math.cos(t * Math.PI * 2) * 3));
    } else if (presetKey === "fastest") {
      // Extremely flat (8m - 12m)
      elevations.push(Math.round(10 + Math.sin(t * Math.PI * 2) * 1.5));
    } else {
      // Flat segment (12m - 22m)
      elevations.push(Math.round(14 + Math.cos(t * Math.PI * 3) * 4));
    }
  }
  return elevations;
}

export default function App() {
  const [activePreset, setActivePreset] = useState<"scenic" | "fastest" | "flat" | "mountain">("scenic");
  const [isVoiceEnabled, setIsVoiceEnabled] = useState<boolean>(true);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [commandText, setCommandText] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAssistantLoading, setIsAssistantLoading] = useState<boolean>(false);

  // Bike computer telemetry stats
  const [speed, setSpeed] = useState<number>(24.8);
  const [cadence, setCadence] = useState<number>(84);
  const [heartRate, setHeartRate] = useState<number>(132);
  const [power, setPower] = useState<number>(185);
  const [windRelativeAngle, setWindRelativeAngle] = useState<number>(45); // Degrees relative to direction of cyclist (0 = tailwind, 180 = headwind)
  const [windSpeed, setWindSpeed] = useState<number>(14); // km/h
  const [rideDuration, setRideDuration] = useState<number>(0); // Seconds

  // Target recommendations (updated by voice assistant)
  const [targets, setTargets] = useState<MetricsAdjustment>({
    targetCadence: 85,
    targetSpeed: 25,
    effortLevel: "有氧耐力 (Zone 2)",
    slopeWarning: "風阻與路況極佳，順風騎乘"
  });

  const [suggestedStops, setSuggestedStops] = useState<SuggestedStop[]>([
    { name: "社子島濕地公園", category: "viewpoint", description: "風景絕佳拍照點，可以眺望關渡大橋", distanceFromStart: "6.8 km" },
    { name: "關渡宮單車驛站", category: "supply", description: "大型公共休息區，提供洗手間與水補給", distanceFromStart: "12.0 km" }
  ]);

  // Simulation controls
  const [isSimulationRunning, setIsSimulationRunning] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [simSpeedFactor, setSimSpeedFactor] = useState<number>(1); // 1x or 5x or 10x speed

  // Ref objects for Leaflet maps
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);
  const riderMarkerRef = useRef<any>(null);
  const waypointMarkersRef = useRef<any[]>([]);

  // Sound recognition & synthesis refs
  const recognitionRef = useRef<any>(null);

  // Get active route data
  const routeData = PRESETS[activePreset];
  const interpolatedPath = interpolateRoute(routeData.waypoints);
  const elevationProfile = generateElevations(activePreset);

  // Speech helper function
  const speak = useCallback((text: string) => {
    if (!isVoiceEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    // Clean markdown syntax from assistant speech text
    const cleanText = text.replace(/[#*`_\-]/g, "").trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "zh-TW";
    utterance.rate = 1.05; // Slightly faster for natural feel
    window.speechSynthesis.speak(utterance);
  }, [isVoiceEnabled]);

  // Handle system prompt greeting on mount
  useEffect(() => {
    const greetingMsg: Message = {
      id: "greet",
      sender: "assistant",
      text: `### 🚴 您好！我是 AERO 智能聲學導航系統

歡迎使用您的自行車聲學車錶。在騎行時，您可以直接按住 **語音麥克風** 與我交談，或使用下方快捷指令優化您的路線。

*   **「幫我優化速度」** ➔ 推薦筆直平坦、風阻低的 Dajia 綠能段。
*   **「我想挑戰爬坡」** ➔ 規劃楊明山经典挑戰，並計算檔位配速。
*   **「切換到風景休閒線」** ➔ 規劃舒適休閒的淡水河濱落日美景。
*   **「分析風阻與氣候」** ➔ 查看目前的東北風與破風空力姿態指南。`,
      speech: "您好！我是您的自行車聲學助理。今天想去哪裡騎車呢？對我說出「優化速度」或「挑戰爬坡」可以隨時優化路線喔！",
      timestamp: new Date()
    };
    setMessages([greetingMsg]);
    setTimeout(() => {
      speak(greetingMsg.speech!);
    }, 1200);
  }, [speak]);

  // Leaflet Map Initialization
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      // Map is initialized
      const initialCoords = routeData.waypoints[0];
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([initialCoords.lat, initialCoords.lng], 13);

      // Add high-contrast dark tile map (ideal for high-tech look)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19
      }).addTo(mapRef.current);

      // Add a customized, responsive Zoom controller at the bottom right
      L.control.zoom({
        position: "bottomright"
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Clear previous markers & lines
    if (routePolylineRef.current) {
      map.removeLayer(routePolylineRef.current);
    }
    waypointMarkersRef.current.forEach(marker => map.removeLayer(marker));
    waypointMarkersRef.current = [];

    // Redraw Route Polyline (neon blue color for sleek modern aesthetic)
    const latlngs = routeData.waypoints.map(w => [w.lat, w.lng]);
    routePolylineRef.current = L.polyline(latlngs, {
      color: "#3b82f6",
      weight: 5,
      opacity: 0.85,
      dashArray: "10, 8",
      lineCap: "round"
    }).addTo(map);

    // Draw Waypoint Markers
    routeData.waypoints.forEach((wp, index) => {
      const isStart = index === 0;
      const isEnd = index === routeData.waypoints.length - 1;

      // Custom high-contrast div icons matching color theme
      const iconHtml = `
        <div class="flex items-center justify-center w-6 h-6 rounded-full border-2 ${
          isStart ? "bg-emerald-500/90 border-emerald-300" : isEnd ? "bg-rose-500/90 border-rose-300" : "bg-blue-500/90 border-blue-300"
        } shadow-lg text-[10px] font-bold text-white">
          ${isStart ? "S" : isEnd ? "E" : index}
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: "custom-leaflet-icon",
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([wp.lat, wp.lng], { icon: customIcon })
        .addTo(map)
        .bindPopup(`<b>${isStart ? "起點" : isEnd ? "終點" : `站點 ${index}`}</b>: ${wp.name}`);
      
      waypointMarkersRef.current.push(marker);
    });

    // Create or update Rider Marker (High brightness Blue Dot)
    const riderCoords = interpolatedPath[currentStep] || routeData.waypoints[0];
    
    if (riderMarkerRef.current) {
      map.removeLayer(riderMarkerRef.current);
    }

    const riderIconHtml = `
      <div class="relative flex items-center justify-center w-8 h-8">
        <div class="absolute w-8 h-8 rounded-full bg-blue-500/30 animate-ping"></div>
        <div class="w-5 h-5 rounded-full bg-blue-500 border-2 border-[#0A0A0B] flex items-center justify-center shadow-lg">
          <svg class="w-3 h-3 text-white transform rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <polygon points="12,2 22,22 12,17 2,22" fill="currentColor"/>
          </svg>
        </div>
      </div>
    `;

    const riderIcon = L.divIcon({
      html: riderIconHtml,
      className: "rider-leaflet-icon",
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    riderMarkerRef.current = L.marker([riderCoords.lat, riderCoords.lng], { icon: riderIcon })
      .addTo(map)
      .bindPopup("<b>目前騎手位置</b>");

    // Recenter the map fitting all coordinates
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { padding: [40, 40] });

  }, [activePreset]); // Trigger redraw when activePreset changes

  // Update rider marker position dynamically during ride simulation
  useEffect(() => {
    if (!mapRef.current || !riderMarkerRef.current || interpolatedPath.length === 0) return;
    const pos = interpolatedPath[currentStep] || interpolatedPath[0];
    riderMarkerRef.current.setLatLng([pos.lat, pos.lng]);

    // Pan map smoothly to stay focused on cyclist
    if (isSimulationRunning && currentStep % 4 === 0) {
      mapRef.current.panTo([pos.lat, pos.lng], { animate: true });
    }
  }, [currentStep, interpolatedPath, isSimulationRunning]);

  // Audio / Speech Recognition setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.lang = "zh-TW";
      rec.continuous = false;
      rec.interimResults = false;

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        const result = event.results[0][0].transcript;
        setCommandText(result);
        handleSendCommand(result);
      };

      rec.onerror = (event: any) => {
        console.error("Speech Recognition error", event);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, [activePreset, speed, cadence, heartRate]);

  // Simulate cycling telemetry logs (RPM, Power, HeartRate, Speed) with noise
  useEffect(() => {
    if (!isSimulationRunning) return;

    const interval = setInterval(() => {
      setRideDuration(prev => prev + simSpeedFactor);

      // Advance step along the route
      setCurrentStep(prevStep => {
        const nextStep = prevStep + simSpeedFactor;
        if (nextStep >= interpolatedPath.length - 1) {
          // Finished route!
          setIsSimulationRunning(false);
          const finishText = "恭喜您！已成功抵達導航目的地。本次騎行模擬已圓滿結束。";
          speak(finishText);
          setMessages(prev => [
            ...prev,
            {
              id: `finish-${Date.now()}`,
              sender: "assistant",
              text: "🏆 **已成功抵達目的地！** 您表現得很棒。準備好開啟下一趟旅程了嗎？",
              timestamp: new Date()
            }
          ]);
          return interpolatedPath.length - 1;
        }

        // Trigger dynamic audio announcements at milestones (e.g. 25%, 50%, 75%)
        const milestones = [
          { step: Math.floor(interpolatedPath.length * 0.25), name: "四分之一點", phrase: "您已完成四分之一的騎行路程。呼吸順暢，繼續保持踩踏節奏！" },
          { step: Math.floor(interpolatedPath.length * 0.5), name: "折返中點", phrase: "抵達半程中點。目前風向略有改變，注意變速，調整齒比！" },
          { step: Math.floor(interpolatedPath.length * 0.75), name: "四分之三點", phrase: "已經完成四分之三了！體力消耗大，記得喝水補充水分，加油！" }
        ];

        const matchedMilestone = milestones.find(m => prevStep < m.step && nextStep >= m.step);
        if (matchedMilestone) {
          speak(matchedMilestone.phrase);
          setMessages(prev => [
            ...prev,
            {
              id: `milestone-${Date.now()}`,
              sender: "assistant",
              text: `🔔 **智能通知**：${matchedMilestone.phrase}`,
              timestamp: new Date()
            }
          ]);
        }

        return nextStep;
      });

      // Inject minor realistic noise into speed, cadence, HR, and power based on slope
      // Slopes are determined by looking at the change in elevation curve!
      const elev1 = elevationProfile[currentStep] || 0;
      const elev2 = elevationProfile[currentStep + 1] || elev1;
      const currentSlope = Math.max(-5, Math.min(15, (elev2 - elev1) * 2)); // simulated incline percentage

      setSpeed(prev => {
        const target = targets.targetSpeed;
        const slopeImpact = currentSlope * 0.8; // climb slows rider down
        const rand = (Math.random() - 0.5) * 1.5;
        const speedVal = Math.max(5, target - slopeImpact + rand);
        return parseFloat(speedVal.toFixed(1));
      });

      setCadence(prev => {
        const base = targets.targetCadence;
        const slopeImpact = currentSlope > 4 ? -5 : 2; // climbing slows cadence if heavy
        const rand = Math.round((Math.random() - 0.5) * 4);
        return Math.max(50, Math.min(120, base + slopeImpact + rand));
      });

      setPower(prev => {
        const slopeImpact = currentSlope > 0 ? currentSlope * 25 : -10;
        const basePower = 150;
        const rand = Math.round((Math.random() - 0.5) * 20);
        return Math.max(40, Math.round(basePower + slopeImpact + rand));
      });

      setHeartRate(prev => {
        const slopeImpact = currentSlope > 3 ? currentSlope * 4 : -2;
        const baseHR = 120;
        const rand = Math.round((Math.random() - 0.5) * 2);
        return Math.max(80, Math.min(185, Math.round(baseHR + slopeImpact + rand)));
      });

      // Slowly fluctuate relative wind angle
      setWindRelativeAngle(prev => (prev + Math.round((Math.random() - 0.5) * 6) + 360) % 360);

    }, 1000);

    return () => clearInterval(interval);
  }, [isSimulationRunning, currentStep, targets, elevationProfile, simSpeedFactor, speak, interpolatedPath.length]);

  // Format seconds into hh:mm:ss
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Mic recording activation
  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setCommandText("");
      if (recognitionRef.current) {
        recognitionRef.current.start();
      } else {
        alert("您的瀏覽器不支援 Web 語音識別。建議使用 Chrome 瀏覽器，或者您可以在下方直接輸入文字指令。");
      }
    }
  };

  // Submit Text/Voice command to backend Express server-side Gemini API
  const handleSendCommand = async (textToSend?: string) => {
    const activeText = textToSend || commandText;
    if (!activeText.trim()) return;

    // Add user message to conversation
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: activeText,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    setCommandText("");
    setIsAssistantLoading(true);

    try {
      const response = await fetch("/api/voice-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: activeText,
          currentPreset: activePreset,
          speed,
          cadence,
          heartRate
        })
      });

      if (!response.ok) {
        throw new Error("伺服器語音助理處理失敗。");
      }

      const data: AssistantResponse = await response.json();
      
      // Update Route preset if recommended by Gemini
      if (data.routeOptimization?.shouldChangePreset && data.routeOptimization.recommendedPresetKey) {
        const newPreset = data.routeOptimization.recommendedPresetKey;
        setActivePreset(newPreset);
        setCurrentStep(0); // Reset simulation step
        setRideDuration(0);
      }

      // Update recommended metrics target
      if (data.metricsAdjustment) {
        setTargets(prev => ({
          ...prev,
          ...data.metricsAdjustment
        }));
      }

      // Update suggested stops
      if (data.suggestedStops) {
        setSuggestedStops(data.suggestedStops);
      }

      // Add assistant response to message list
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        text: data.text,
        speech: data.speech,
        timestamp: new Date(),
        routeOptimization: data.routeOptimization
      };

      setMessages(prev => [...prev, assistantMsg]);
      speak(data.speech);

    } catch (err) {
      console.error("Failed to fetch assistant response:", err);
      // Fallback fallback response to ensure user is never stuck
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        sender: "assistant",
        text: "🚨 **系統連線中斷**\n\n抱歉，語音分析模組發生錯誤。請確認您的網路連線或稍後再試。在本地模擬中您可以繼續點擊快速指令。",
        speech: "抱歉，語音助理暫時無法回應，請確認網路連線。",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
      speak(errorMsg.speech!);
    } finally {
      setIsAssistantLoading(false);
    }
  };

  // Render wind arrow rotating based on angle
  const getWindDirectionLabel = (angle: number) => {
    if (angle >= 337.5 || angle < 22.5) return "順風 🟢";
    if (angle >= 22.5 && angle < 67.5) return "側順風 🟢";
    if (angle >= 67.5 && angle < 112.5) return "側風 🟡";
    if (angle >= 112.5 && angle < 157.5) return "側逆風 🔴";
    if (angle >= 157.5 && angle < 202.5) return "強逆風 🔴";
    if (angle >= 202.5 && angle < 247.5) return "側逆風 🔴";
    if (angle >= 247.5 && angle < 292.5) return "側風 🟡";
    return "側順風 🟢";
  };

  // Helper to calculate custom SVG path for Route Elevation Profile
  const renderElevationSvg = () => {
    const width = 500;
    const height = 90;
    const maxVal = activePreset === "mountain" ? 820 : 50;
    const minVal = 0;

    const pointsStr = elevationProfile
      .map((val, idx) => {
        const x = (idx / (elevationProfile.length - 1)) * width;
        const y = height - ((val - minVal) / (maxVal - minVal)) * (height - 15);
        return `${x},${y}`;
      })
      .join(" ");

    // For polygon fill, append bottom corners
    const polygonStr = `0,${height} ${pointsStr} ${width},${height}`;

    // Get color based on preset (all matching the elegant dark blue theme)
    const strokeColor = "#3b82f6";
    const fillId = "grad-blue-theme";

    // Calculate dynamic slope gradient color under current index
    const currentElev = elevationProfile[currentStep] || 0;
    const currentX = (currentStep / (elevationProfile.length - 1)) * width;
    const currentY = height - ((currentElev - minVal) / (maxVal - minVal)) * (height - 15);

    return (
      <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="grad-blue-theme" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Fill Area */}
        <polygon points={polygonStr} fill={`url(#${fillId})`} />

        {/* Thick Path Border */}
        <polyline points={pointsStr} fill="none" stroke={strokeColor} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Dynamic Position Marker Dot */}
        {currentStep < elevationProfile.length && (
          <>
            <line x1={currentX} y1="0" x2={currentX} y2={height} stroke="#2D2D2D" strokeDasharray="3,3" strokeOpacity="0.8" />
            <circle cx={currentX} cy={currentY} r="6" fill="#ffffff" stroke="#3b82f6" strokeWidth="2.5" className="animate-pulse" />
            <circle cx={currentX} cy={currentY} r="10" fill="none" stroke="#3b82f6" strokeWidth="1" className="animate-ping" style={{ animationDuration: "1.5s" }} />
          </>
        )}
      </svg>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0B] text-[#E0E0E0] font-sans" id="app-root">
      
      {/* HEADER SECTION (Elegant Dark Design Theme) */}
      <header className="h-16 border-b border-[#1F1F21] flex items-center justify-between px-8 bg-[#0D0D0F] sticky top-0 z-50" id="app-header">
        <div className="flex items-center space-x-4">
          <div className="w-3 h-3 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
          <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#888888] hidden sm:inline">System: Active</span>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 text-sm font-bold tracking-widest text-white uppercase font-sans">
          VELONAV <span className="text-blue-500">AERO v9.0</span>
        </div>
        
        <div className="flex items-center space-x-4 md:space-x-6 text-xs font-mono">
          <div className="hidden lg:flex items-center space-x-2">
            <span className="text-[10px] text-[#888888]">ROUTE</span>
            <span className="text-xs text-blue-400 font-bold uppercase">{activePreset}</span>
          </div>
          <div className="hidden md:flex items-center space-x-2">
            <span className="text-[10px] text-[#888888]">TIME</span>
            <span className="text-xs text-white">{formatTime(rideDuration)}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-[#888888]">WIND</span>
            <span className="text-xs text-cyan-400">{windSpeed} km/h</span>
          </div>
          <button
            onClick={() => {
              setIsVoiceEnabled(!isVoiceEnabled);
              speak(isVoiceEnabled ? "語音聲學助理已關閉" : "智慧語音導航已開啟");
            }}
            className={`flex items-center gap-1.5 px-3 h-8 rounded border text-[10px] font-bold tracking-widest uppercase cursor-pointer transition-all ${
              isVoiceEnabled
                ? "bg-blue-600/10 text-blue-400 border-blue-500/30 shadow-[0_0_8px_rgba(59,130,246,0.2)]"
                : "bg-transparent text-[#666666] border-[#1F1F21] hover:text-[#E0E0E0]"
            }`}
            title="開啟或關閉自行車聲學語音廣播功能"
          >
            <span>VOICE: {isVoiceEnabled ? "ON" : "OFF"}</span>
          </button>
        </div>
      </header>

      {/* CORE COCKPIT PANEL (Bento Grid) */}
      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 max-w-[1700px] w-full mx-auto" id="app-body">
        
        {/* LEFT COLUMN: ACOUSTIC COMMANDS & ASSISTANT (4/12 Cols) */}
        <section className="lg:col-span-4 flex flex-col gap-5 h-[calc(100vh-140px)] min-h-[600px]" id="acoustic-section">
          
          {/* ASSISTANT CARD */}
          <div className="bg-[#0D0D0F] border border-[#1F1F21] rounded-xl flex-1 flex flex-col overflow-hidden shadow-2xl relative">
            <div className="p-4 border-b border-[#1F1F21] flex items-center justify-between bg-[#0D0D0F]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500 animate-pulse" />
                <h2 className="text-xs font-bold text-white tracking-widest uppercase font-sans">Acoustic Smart Companion</h2>
              </div>
              <span className="flex items-center gap-1.5 text-[9px] font-mono text-blue-400 uppercase bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping"></span>
                Gemini Active
              </span>
            </div>

            {/* MESSAGE CHAT BOX */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 flex flex-col text-sm scrollbar-thin scrollbar-thumb-[#1F1F21]">
              {messages.map((msg, idx) => (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[85%] rounded-xl p-3.5 relative shadow-md transition-all ${
                    msg.sender === "user"
                      ? "bg-blue-600 text-white self-end rounded-tr-none"
                      : "bg-[#121214] text-[#E0E0E0] self-start border border-[#1F1F21] rounded-tl-none"
                  }`}
                >
                  {msg.sender === "assistant" ? (
                    <div className="prose prose-invert prose-xs text-slate-200">
                      {/* Markdown rendering simplified */}
                      <div className="whitespace-pre-line leading-relaxed font-sans text-xs md:text-sm">
                        {msg.text.replace(/###/g, "").replace(/\*\*/g, "").replace(/\*/g, "•")}
                      </div>
                    </div>
                  ) : (
                    <p className="font-sans font-medium">{msg.text}</p>
                  )}
                  <span className={`text-[9px] mt-1.5 self-end ${msg.sender === "user" ? "text-blue-100" : "text-[#666666]"}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
              {isAssistantLoading && (
                <div className="bg-[#121214] border border-[#1F1F21] rounded-xl p-4 self-start flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                  <span className="text-xs text-blue-400 font-mono">Gemini 正在分析路況與優化風阻...</span>
                </div>
              )}
            </div>

            {/* WAVEFORM VISUALIZER (Simulates speaking or active mic) */}
            {(isListening || isAssistantLoading) && (
              <div className="absolute bottom-16 left-0 right-0 h-10 bg-[#0A0A0B]/95 border-y border-[#1F1F21] flex items-center justify-center gap-1 overflow-hidden transition-all duration-300">
                <span className="text-[10px] text-blue-400 font-mono uppercase tracking-widest mr-3">
                  {isListening ? "Listening" : "Processing"}
                </span>
                {[...Array(12)].map((_, i) => {
                  const delay = i * 0.15;
                  return (
                    <div
                      key={i}
                      className="w-1 rounded-full bg-[#3B82F6] transition-all duration-300"
                      style={{
                        height: isListening ? "12px" : "28px",
                        animation: "bounce 0.8s ease-in-out infinite alternate",
                        animationDelay: `${delay}s`,
                      }}
                    />
                  );
                })}
              </div>
            )}

            {/* CHAT INPUT AREA */}
            <div className="p-3.5 border-t border-[#1F1F21] bg-[#0D0D0F] flex items-center gap-2">
              <button
                onClick={toggleListening}
                className={`p-3 rounded-xl flex items-center justify-center cursor-pointer transition-all ${
                  isListening
                    ? "bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-500/20"
                    : "bg-[#121214] hover:bg-[#1F1F21] text-[#A0A0A0] hover:text-white border border-[#1F1F21]"
                }`}
                title="點擊開始語音控制 (Speak traditional Chinese)"
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <input
                type="text"
                placeholder="輸入語音指令... (例如：優化山路、尋找補給)"
                value={commandText}
                onChange={e => setCommandText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSendCommand()}
                className="flex-1 bg-[#0A0A0B]/80 text-[#E0E0E0] border border-[#1F1F21] rounded-xl px-4 py-3 text-xs placeholder:text-[#666666] focus:outline-none focus:border-blue-500 transition-all"
              />

              <button
                onClick={() => handleSendCommand()}
                disabled={!commandText.trim()}
                className="p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-[#121214] disabled:text-[#666666] text-white border border-[#1F1F21] font-bold rounded-xl flex items-center justify-center cursor-pointer transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* QUICK COMMAND PRESETS */}
          <div className="bg-[#0D0D0F] border border-[#1F1F21] rounded-xl p-4 shadow-xl">
            <h3 className="text-xs font-bold text-[#888888] tracking-wider uppercase mb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-500" />
              語音聲學快捷指令 (Acoustic Shortcut Actions)
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleSendCommand("幫我優化速度")}
                className="px-3 py-2 bg-[#0A0A0B] hover:bg-[#121214] border border-[#1F1F21] hover:border-blue-500 text-left rounded-xl transition-all flex flex-col justify-between group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] text-blue-400 font-bold">🚀 SPEED METER</span>
                  <Sparkles className="w-3 h-3 text-blue-500/50 group-hover:text-blue-400" />
                </div>
                <span className="text-[11px] font-semibold text-slate-200 mt-1">優化衝刺速度</span>
              </button>

              <button
                onClick={() => handleSendCommand("我要挑戰爬坡")}
                className="px-3 py-2 bg-[#0A0A0B] hover:bg-[#121214] border border-[#1F1F21] hover:border-blue-500 text-left rounded-xl transition-all flex flex-col justify-between group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] text-blue-400 font-bold">⛰ HILLCLIMB</span>
                  <Sparkles className="w-3 h-3 text-blue-500/50 group-hover:text-blue-400" />
                </div>
                <span className="text-[11px] font-semibold text-slate-200 mt-1">挑戰陽明山坡</span>
              </button>

              <button
                onClick={() => handleSendCommand("切換到風景休閒路線")}
                className="px-3 py-2 bg-[#0A0A0B] hover:bg-[#121214] border border-[#1F1F21] hover:border-blue-500 text-left rounded-xl transition-all flex flex-col justify-between group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] text-blue-400 font-bold">🌅 SCENIC RIVER</span>
                  <Sparkles className="w-3 h-3 text-blue-500/50 group-hover:text-blue-400" />
                </div>
                <span className="text-[11px] font-semibold text-slate-200 mt-1">休閒河濱風光</span>
              </button>

              <button
                onClick={() => handleSendCommand("避風平緩路線")}
                className="px-3 py-2 bg-[#0A0A0B] hover:bg-[#121214] border border-[#1F1F21] hover:border-blue-500 text-left rounded-xl transition-all flex flex-col justify-between group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] text-blue-400 font-bold">🌳 SILENT GREEN</span>
                  <Sparkles className="w-3 h-3 text-blue-500/50 group-hover:text-blue-400" />
                </div>
                <span className="text-[11px] font-semibold text-slate-200 mt-1">避風平緩綠道</span>
              </button>

              <button
                onClick={() => handleSendCommand("分析風阻與氣候")}
                className="px-3 py-2 bg-[#0A0A0B] hover:bg-[#121214] border border-[#1F1F21] hover:border-blue-500 text-left rounded-xl transition-all flex flex-col justify-between group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] text-blue-400 font-bold">💨 AERODYNAMICS</span>
                  <Sparkles className="w-3 h-3 text-blue-500/50 group-hover:text-blue-400" />
                </div>
                <span className="text-[11px] font-semibold text-slate-200 mt-1">實時風阻係數</span>
              </button>

              <button
                onClick={() => handleSendCommand("附近哪裡可以補給水與香蕉？")}
                className="px-3 py-2 bg-[#0A0A0B] hover:bg-[#121214] border border-[#1F1F21] hover:border-blue-500 text-left rounded-xl transition-all flex flex-col justify-between group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] text-blue-400 font-bold">🍌 STATIONS</span>
                  <Sparkles className="w-3 h-3 text-blue-500/50 group-hover:text-blue-400" />
                </div>
                <span className="text-[11px] font-semibold text-slate-200 mt-1">尋找前方補給</span>
              </button>
            </div>
          </div>
        </section>

        {/* MIDDLE COLUMN: MAP & GPS SIMULATOR (5/12 Cols) */}
        <section className="lg:col-span-5 flex flex-col gap-5 h-[calc(100vh-140px)] min-h-[600px]" id="map-section">
          
          {/* MAP CONTAINER */}
          <div className="bg-[#0D0D0F] border border-[#1F1F21] rounded-xl flex-1 flex flex-col overflow-hidden shadow-2xl relative">
            
            {/* Top map controls */}
            <div className="absolute top-3 left-3 z-30 flex flex-wrap gap-2 pointer-events-auto">
              <div className="bg-[#0A0A0B]/90 border border-[#1F1F21] rounded-xl px-3 py-2 text-xs flex items-center gap-2 shadow-lg">
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-ping"></span>
                <span className="font-semibold text-white">GPS 導航已定位</span>
              </div>
            </div>

            {/* Simulated active telemetry overlay */}
            <div className="absolute bottom-3 left-3 z-30 pointer-events-auto flex flex-col gap-2">
              <div className="bg-[#0A0A0B]/90 border border-[#1F1F21] rounded-xl px-3.5 py-2.5 shadow-xl text-left max-w-sm">
                <div className="text-[10px] font-mono text-[#888888] font-semibold flex items-center gap-1.5 uppercase">
                  <Activity className="w-3 h-3 text-blue-500" /> Current Segment
                </div>
                <h4 className="text-xs font-bold text-white mt-1 leading-snug line-clamp-1">{routeData.name}</h4>
                <div className="flex items-center gap-3 mt-2 text-[11px]">
                  <div>
                    <span className="text-[#888888]">總距離:</span> <span className="font-bold text-white font-mono">{routeData.distance}</span>
                  </div>
                  <div className="w-px h-3 bg-[#1F1F21]"></div>
                  <div>
                    <span className="text-[#888888]">總爬升:</span> <span className="font-bold text-blue-400 font-mono">+{routeData.elevationGain}</span>
                  </div>
                  <div className="w-px h-3 bg-[#1F1F21]"></div>
                  <div>
                    <span className="text-[#888888]">均坡:</span> <span className="font-bold text-blue-400 font-mono">{routeData.avgSlope}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* REAL MAP COMPONENT */}
            <div className="flex-1 w-full h-full z-10" ref={mapContainerRef} id="leaflet-map"></div>

            {/* SIMULATOR CONTROL BAR */}
            <div className="bg-[#0A0A0B] border-t border-[#1F1F21] px-4 py-3.5 flex items-center justify-between flex-wrap gap-3 z-20">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsSimulationRunning(!isSimulationRunning);
                    speak(isSimulationRunning ? "導航模擬已暫停" : "開始實時導航，祝您騎乘愉快！");
                  }}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                    isSimulationRunning
                      ? "bg-[#1F1F21] border border-[#2D2D2D] text-white hover:bg-[#121214]"
                      : "bg-blue-600 hover:bg-blue-500 text-white"
                  }`}
                  title="啟動/暫停 GPS 模擬器"
                >
                  {isSimulationRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{isSimulationRunning ? "暫停導航" : "開始模擬騎乘"}</span>
                </button>

                <button
                  onClick={() => {
                    setCurrentStep(0);
                    setIsSimulationRunning(false);
                    setRideDuration(0);
                  }}
                  className="p-2.5 bg-[#121214] border border-[#1F1F21] hover:border-[#2D2D2D] rounded-xl text-[#A0A0A0] hover:text-white transition-all cursor-pointer"
                  title="重置騎乘進度"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* Simulation Speeder multiplier */}
              <div className="flex items-center gap-1.5 bg-[#121214] border border-[#1F1F21] px-2 py-1 rounded-xl">
                <span className="text-[10px] font-mono text-[#888888] px-1 font-bold">倍速:</span>
                {[1, 5, 10].map(factor => (
                  <button
                    key={factor}
                    onClick={() => setSimSpeedFactor(factor)}
                    className={`px-2 py-1 font-mono text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      simSpeedFactor === factor ? "bg-blue-600 text-white" : "text-[#A0A0A0] hover:text-white"
                    }`}
                  >
                    {factor}x
                  </button>
                ))}
              </div>

              {/* Progress Bar */}
              <div className="w-full flex items-center gap-3 mt-1.5">
                <div className="flex-1 bg-[#121214] h-2 rounded-full overflow-hidden border border-[#1F1F21]">
                  <div
                    className="bg-gradient-to-r from-blue-600 to-blue-400 h-full rounded-full transition-all duration-300"
                    style={{ width: `${(currentStep / (interpolatedPath.length - 1)) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-[#888888] font-bold min-w-[32px]">
                  {Math.round((currentStep / (interpolatedPath.length - 1)) * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* DYNAMIC ELEVATION PROFILE CHART */}
          <div className="bg-[#0D0D0F] border border-[#1F1F21] rounded-xl p-4 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#888888] tracking-wider uppercase flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                航線坡度剖面與當前位置 (Terrain Elevation Profile)
              </h3>
              <span className="text-[10px] font-mono font-bold text-blue-400">
                高度: {elevationProfile[currentStep] || 0} m
              </span>
            </div>

            <div className="w-full h-24 bg-[#0A0A0B] border border-[#1F1F21] rounded-xl p-2 relative">
              {renderElevationSvg()}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: INSTRUMENT COCKPIT & METRICS (3/12 Cols) */}
        <section className="lg:col-span-3 flex flex-col gap-5 h-[calc(100vh-140px)] min-h-[600px]" id="cockpit-section">
          
          {/* DIGITAL SPEEDOMETER GAUGE */}
          <div className="bg-[#0D0D0F] border border-[#1F1F21] rounded-xl p-5 shadow-xl flex flex-col items-center justify-center text-center relative group">
            <div className="absolute top-3 right-3 text-[9px] font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded font-bold">
              GPS SENSOR
            </div>

            {/* Giant Speed value with rotating circular bezel */}
            <div className="relative w-40 h-40 flex items-center justify-center">
              {/* Outer dial glow background */}
              <div className="absolute inset-2 rounded-full border border-dashed border-[#1F1F21] group-hover:border-[#2D2D2D] transition-all"></div>
              
              {/* Rotating glowing arc representing active speed */}
              <svg className="absolute w-full h-full transform -rotate-90">
                <circle
                  cx="80"
                  cy="80"
                  r="68"
                  stroke="#121214"
                  strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="68"
                  stroke="#3b82f6"
                  strokeWidth="7"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 68}
                  strokeDashoffset={2 * Math.PI * 68 * (1 - Math.min(speed, 50) / 50)}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              </svg>

              <div className="z-10 flex flex-col items-center mt-3">
                <span className="text-5xl font-mono text-white font-light tracking-tight">{speed}</span>
                <span className="text-[10px] font-mono text-blue-500 font-bold uppercase tracking-wider mt-1">KM/H</span>
              </div>
            </div>

            <div className="w-full grid grid-cols-2 gap-3 mt-4 border-t border-[#1F1F21] pt-3 text-left">
              <div>
                <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                  <Activity className="w-3 h-3 text-blue-500" /> CADENCE
                </div>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-mono text-white font-bold">{cadence}</span>
                  <span className="text-[9px] text-slate-500 font-bold font-mono">RPM</span>
                </div>
              </div>
              
              <div>
                <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                  <Zap className="w-3 h-3 text-blue-400" /> ESTIMATED POWER
                </div>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-mono text-blue-400 font-bold">{power}</span>
                  <span className="text-[9px] text-slate-500 font-bold font-mono">WATTS</span>
                </div>
              </div>
            </div>
          </div>

          {/* DYNAMIC ASSISTANT TARGET ADVICES CARD */}
          <div className="bg-[#0D0D0F] border border-[#1F1F21] rounded-xl p-4 shadow-xl flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-xs font-bold text-[#888888] tracking-wider uppercase flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-500 animate-pulse" />
                  語音助理推薦策略 (AI Target Targets)
                </h3>
              </div>

              {/* Dynamic instruction container */}
              <div className="space-y-3">
                {/* Cadence Target */}
                <div className="bg-[#0A0A0B]/80 border border-[#1F1F21] rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg">
                      <Gauge className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white leading-none">推薦轉速</h4>
                      <p className="text-[10px] text-slate-500 mt-1">維持關節與踩踏效率</p>
                    </div>
                  </div>
                  <span className="text-lg font-mono text-blue-400 font-bold">{targets.targetCadence} RPM</span>
                </div>

                {/* Target Speed */}
                <div className="bg-[#0A0A0B]/80 border border-[#1F1F21] rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white leading-none">目標時速</h4>
                      <p className="text-[10px] text-slate-500 mt-1">體力控制與配速建議</p>
                    </div>
                  </div>
                  <span className="text-lg font-mono text-blue-400 font-bold">{targets.targetSpeed} KM/H</span>
                </div>

                {/* Wind aerodynamics indicator */}
                <div className="bg-[#0A0A0B]/80 border border-[#1F1F21] rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg">
                        <Wind className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white leading-none">相對風阻與風向</h4>
                        <p className="text-[10px] text-slate-500 mt-1">{getWindDirectionLabel(windRelativeAngle)}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-blue-400">{routeData.windCoef}</span>
                  </div>

                  {/* Compass pointer */}
                  <div className="flex items-center justify-center gap-2 mt-1.5">
                    <span className="text-[10px] text-slate-400 font-mono">風向方位：</span>
                    <div className="relative w-8 h-8 rounded-full border border-[#1F1F21] flex items-center justify-center">
                      <Compass
                        className="w-5 h-5 text-blue-400 transform transition-all duration-500"
                        style={{ transform: `rotate(${windRelativeAngle}deg)` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold text-white">{windRelativeAngle}°</span>
                  </div>
                </div>

                {/* Alert warning box */}
                {targets.slopeWarning && (
                  <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex gap-2 text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="text-left">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider leading-none">路段特徵與警報</h4>
                      <p className="text-[11px] font-medium leading-relaxed mt-1.5 text-slate-200">{targets.slopeWarning}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick calibration help note */}
            <div className="border-t border-[#1F1F21] pt-3.5 mt-3 text-left">
              <div className="flex items-start gap-2 text-[11px] text-slate-400">
                <Info className="w-4 h-4 text-blue-500 shrink-0" />
                <p className="leading-relaxed">
                  本助理內置自行車物理學阻力公式。風阻係數（CdA）會因騎姿而異。對助理說話可引導您進行最優姿勢調整與齒比切換。
                </p>
              </div>
            </div>
          </div>

          {/* INTEREST POINTS / SUGGESTED STOPS */}
          <div className="bg-[#0D0D0F] border border-[#1F1F21] rounded-xl p-4 shadow-xl flex flex-col gap-3">
            <h3 className="text-xs font-bold text-[#888888] tracking-wider uppercase flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-500" />
              推薦沿途補給與景觀點 (Scenic Stops & Supplies)
            </h3>
            
            <div className="space-y-2 max-h-[140px] overflow-y-auto scrollbar-none">
              {suggestedStops.map((stop, idx) => (
                <div key={idx} className="bg-[#0A0A0B]/80 border border-[#1F1F21] rounded-xl p-2.5 flex items-start justify-between text-left group hover:border-[#2D2D2D] transition-all">
                  <div className="flex gap-2">
                    <span className="text-base shrink-0 mt-0.5" title={stop.category}>
                      {stop.category === "supply" ? "🍌" : stop.category === "viewpoint" ? "📸" : stop.category === "rest" ? "☕" : "🛠"}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">{stop.name}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{stop.description}</p>
                    </div>
                  </div>
                  {stop.distanceFromStart && (
                    <span className="text-[9px] font-mono font-bold bg-[#121214] text-[#888888] border border-[#1F1F21] px-1.5 py-0.5 rounded shrink-0">
                      {stop.distanceFromStart}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>

      {/* FOOTER METRICS AND STATUS */}
      <footer className="border-t border-[#1F1F21] bg-[#0D0D0F] px-6 py-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3" id="app-footer">
        <p className="flex items-center gap-2">
          <span>© 2026 Bicycle Acoustic Navigation System</span>
          <span className="w-1.5 h-1.5 bg-[#1F1F21] rounded-full"></span>
          <span>Aero Cockpit Series V9</span>
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 font-mono">
            <Activity className="w-3.5 h-3.5 text-blue-500" />
            HEART RATE: <strong className="text-white font-bold">{heartRate} BPM</strong>
          </span>
          <span className="flex items-center gap-1.5 font-mono">
            <Volume2 className="w-3.5 h-3.5 text-blue-400" />
            ACOUSTICS: <strong className="text-white font-bold">SPEECH SYNTHESIS OK</strong>
          </span>
          <span className="flex items-center gap-1.5 font-mono">
            <Smartphone className="w-3.5 h-3.5 text-blue-500" />
            SPEECH RECOGNITION: <strong className="text-white font-bold">READY</strong>
          </span>
        </div>
      </footer>
    </div>
  );
}
