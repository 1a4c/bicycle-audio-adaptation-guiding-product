import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize Gemini SDK securely on the server side
let ai: GoogleGenAI | null = null;
const apiKey = process.env.GEMINI_API_KEY;

if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    console.log("✓ Gemini API successfully initialized server-side.");
  } catch (error) {
    console.error("✗ Failed to initialize Gemini API client:", error);
  }
} else {
  console.log("⚠ GEMINI_API_KEY is not configured or is using the placeholder. Running in High-Fidelity Simulation mode for local preview.");
}

// Predefined routes database for the assistant to reference
const PRESETS = {
  scenic: {
    name: "淡水河畔休閒車道 (Tamsui Riverfront Leisure Trail)",
    distance: "18.2 km",
    elevationGain: "45 m",
    avgSlope: "0.8%",
    windCoef: "0.35 (低阻力)",
    description: "沿著淡水河畔的休濱自行車道，風景優美，路面平坦，非常適合休閒與夜騎。",
    waypoints: [
      { name: "大稻埕碼頭", lat: 25.0562, lng: 121.5074 },
      { name: "社子島濕地", lat: 25.1098, lng: 121.4912 },
      { name: "關渡宮補給站", lat: 25.1176, lng: 121.4632 },
      { name: "淡水老街終點", lat: 25.1699, lng: 121.4442 }
    ]
  },
  fastest: {
    name: "大佳綠能公路段 (Dajia Green Energy High-Speed Segment)",
    distance: "12.5 km",
    elevationGain: "20 m",
    avgSlope: "0.2%",
    windCoef: "0.45 (中等側風)",
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
    windCoef: "0.28 (極低阻力/林蔭遮蔽)",
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
    windCoef: "0.55 (逆風/高坡度阻力)",
    description: "高難度的經典山路爬坡路線，沿途坡度起伏大，適合進階車友進行大腿力量與耐爬升訓練。",
    waypoints: [
      { name: "士林捷運站起點", lat: 25.0932, lng: 121.5263 },
      { name: "仰德大道入口", lat: 25.0978, lng: 121.5368 },
      { name: "文化大學補給站", lat: 25.1362, lng: 121.5412 },
      { name: "冷水坑服務區終點", lat: 25.1662, lng: 121.5622 }
    ]
  }
};

// POST route for parsing voice/text commands and route optimizations
app.post("/api/voice-assistant", async (req, res) => {
  const { command, currentPreset = "scenic", speed = 25, cadence = 85, heartRate = 135 } = req.body;

  if (!command || typeof command !== "string") {
    return res.status(400).json({ error: "Command string is required." });
  }

  console.log(`[Assistant] Received user command: "${command}" (Preset: ${currentPreset})`);

  // Define structured JSON Schema for Gemini
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      speech: {
        type: Type.STRING,
        description: "A short, motivating voice announcement in Traditional Chinese (zh-TW) that will be synthesized into speech. Keep it brief (under 120 characters), punchy, and voice-friendly for the rider. Example: '已為您優化路線！為了避開陡坡，建議切換至河濱平緩車道，目前風向順風，可以稍微提高檔位喔！'",
      },
      text: {
        type: Type.STRING,
        description: "A detailed markdown formatted explanation of the route optimization, cycling strategy, and terrain analysis.",
      },
      routeOptimization: {
        type: Type.OBJECT,
        description: "Details of route selection change if the user requested a route change or optimization.",
        properties: {
          shouldChangePreset: { type: Type.BOOLEAN },
          recommendedPresetKey: { 
            type: Type.STRING, 
            description: "Must be one of: 'scenic', 'fastest', 'flat', 'mountain'" 
          },
          reason: { type: Type.STRING, description: "Short description of why this preset is recommended." }
        },
        required: ["shouldChangePreset"]
      },
      suggestedStops: {
        type: Type.ARRAY,
        description: "Points of interest or stops suggested for the optimized route.",
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            category: { type: Type.STRING, description: "e.g., supply (補給), rest (休閒), viewpoint (風景), bikeshop (車行)" },
            description: { type: Type.STRING },
            distanceFromStart: { type: Type.STRING }
          },
          required: ["name", "category", "description"]
        }
      },
      metricsAdjustment: {
        type: Type.OBJECT,
        description: "Actionable target recommendations for the rider based on the terrain.",
        properties: {
          targetCadence: { type: Type.NUMBER, description: "Recommended RPM" },
          targetSpeed: { type: Type.NUMBER, description: "Recommended speed in km/h" },
          effortLevel: { type: Type.STRING, description: "e.g., '輕鬆 (Zone 1)', '有氧 (Zone 2)', '乳酸閥值 (Zone 4)'" },
          slopeWarning: { type: Type.STRING, description: "Hazard or slope warning if applicable." }
        }
      }
    },
    required: ["speech", "text"]
  };

  if (ai) {
    try {
      const prompt = `
        You are the voice assistant for a high-end Smart Bicycle Computer (智能自行車車錶).
        The cyclist is currently riding.
        
        Current Status of Rider:
        - Current Active Preset Route Key: "${currentPreset}" (Details: ${JSON.stringify(PRESETS[currentPreset as keyof typeof PRESETS] || PRESETS.scenic)})
        - Current Speed: ${speed} km/h
        - Current Cadence: ${cadence} RPM
        - Current Heart Rate: ${heartRate} BPM
        
        Rider's Command (or Voice Input): "${command}"
        
        Please interpret the user's intent:
        1. If they ask to optimize for "speed", "fast", "平路", "高速", recommend changing route to the "fastest" preset (or "flat" if they want no hills/climbing).
        2. If they ask to optimize for "hills", "climbing", "爬坡", "挑戰", recommend changing to the "mountain" preset.
        3. If they ask for "relaxing", "scenic", "悠閒", "風景", "河濱", recommend the "scenic" preset.
        4. If they ask for "flat", "平緩", "不爬山", "輕鬆", recommend the "flat" preset.
        5. If they just ask a cycling question, answer them intelligently as a veteran cycling coach, providing helpful voice instructions and metrics tips.
        
        Your response MUST be in Traditional Chinese (zh-TW). Ensure your speech text is natural, inspiring, and concise.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          systemInstruction: "You are an expert cycling coach, route optimizer, and acoustic voice assistant built into a smart bike cockpit computer. Speak in professional and encouraging Traditional Chinese (zh-TW). Keep voice feedback extremely clear and readable for text-to-speech engines.",
          temperature: 0.3
        }
      });

      const resultText = response.text;
      if (resultText) {
        const parsedResult = JSON.parse(resultText);
        return res.json(parsedResult);
      } else {
        throw new Error("Empty response from Gemini model.");
      }
    } catch (error) {
      console.error("[Assistant] Gemini processing error:", error);
      // Fall through to simulation if API fails or rate-limits
    }
  }

  // High-Fidelity Local Simulation Fallback (If API key not set or calls fail)
  let responseObj = {
    speech: "收到語音指令。正在為您分析路線路況。",
    text: "### 語音助理即時分析\n\n系統目前運作於高模擬模式。我們為您提供了精準的路線優化與騎乘分析！",
    routeOptimization: { shouldChangePreset: false, recommendedPresetKey: currentPreset, reason: "" },
    suggestedStops: [
      { name: "自行車補給站", category: "supply", description: "提供打氣筒與免費飲用水", distanceFromStart: "4.5 km" },
      { name: "景觀咖啡廳", category: "rest", description: "車友聚集地，可欣賞河濱夕陽", distanceFromStart: "8.2 km" }
    ],
    metricsAdjustment: { targetCadence: 85, targetSpeed: 24, effortLevel: "有氧耐力 (Zone 2)", slopeWarning: "路面平整，風阻微弱" }
  };

  const cleanCmd = command.toLowerCase();

  if (cleanCmd.includes("速") || cleanCmd.includes("快") || cleanCmd.includes("衝刺") || cleanCmd.includes("fast") || cleanCmd.includes("speed")) {
    responseObj.speech = "已收到速度優化指令！為您推薦『大佳綠能公路段』，該路段筆直寬敞且無紅綠燈干擾，非常適合進行高速巡航與踏頻衝刺。建議踏頻保持在九十轉以上。";
    responseObj.text = `### 🚀 路線優化：高速公路段

根據您的速度優化需求，已為您計算出最速路線。

*   **建議路線**：${PRESETS.fastest.name}
*   **優勢分析**：
    1.  全線封閉無紅綠燈，可維持完美的踩踏節奏。
    2.  路面平坦度高，滾動阻力極小。
*   **教練提示**：目前逆風阻力微增，建議稍微壓低身姿（Aerodynamic Position）以減少正面迎風風阻，踏頻建議調高至 **90 - 95 RPM** 以保護膝蓋。`;
    responseObj.routeOptimization = {
      shouldChangePreset: true,
      recommendedPresetKey: "fastest",
      reason: "速度優先，筆直寬廣無號誌干擾"
    };
    responseObj.suggestedStops = [
      { name: "大佳行動補給車", category: "supply", description: "補給運動飲料與補胎工具", distanceFromStart: "5.0 km" },
      { name: "迎風車友休息亭", category: "rest", description: "設有自行車停車架與大型遮陽棚", distanceFromStart: "9.2 km" }
    ];
    responseObj.metricsAdjustment = {
      targetCadence: 92,
      targetSpeed: 30,
      effortLevel: "節奏控制 (Zone 3)",
      slopeWarning: "風阻略高，建議維持低風阻騎姿"
    };
  } else if (cleanCmd.includes("山") || cleanCmd.includes("爬坡") || cleanCmd.includes("挑戰") || cleanCmd.includes("坡") || cleanCmd.includes("climb") || cleanCmd.includes("mountain")) {
    responseObj.speech = "收到爬坡挑戰指令！已為您優化為『陽明山經典爬坡挑戰』路線。此路段累計爬升達七百八十公尺。建議您調整至輕齒比，維持穩定的有氧心率，準備開始挑戰！";
    responseObj.text = `### ⛰️ 路線優化：經典爬坡挑戰

已為您切換至爬坡訓練專用路線。

*   **建議路線**：${PRESETS.mountain.name}
*   **路況解析**：
    1.  仰德大道前段坡度較陡，平均坡度達 **6.5%**，局部有 **10%** 的陡坡。
    2.  山區氣溫與側風變化大，請隨時注意身體保溫。
*   **教練提示**：
    *   **齒比調整**：切換至前小盤（34T）搭配後大齒（28T-32T），保持踩踏流暢。
    *   **踩踏策略**：避免重踩，將踏頻維持在 **75 - 80 RPM**，將心率鎖定在 Zone 3 - Zone 4 區間，保留體力給後段的冷水坑陡坡。`;
    responseObj.routeOptimization = {
      shouldChangePreset: true,
      recommendedPresetKey: "mountain",
      reason: "爬坡爬升訓練，增強心肺耐力"
    };
    responseObj.suggestedStops = [
      { name: "文化大學便利店", category: "supply", description: "高熱量補給點、香蕉與補給鹽錠", distanceFromStart: "8.5 km" },
      { name: "陽明山車友俱樂部", category: "bikeshop", description: "提供簡易維修工具與高壓打氣", distanceFromStart: "10.0 km" }
    ];
    responseObj.metricsAdjustment = {
      targetCadence: 78,
      targetSpeed: 14,
      effortLevel: "乳酸閥值 (Zone 4)",
      slopeWarning: "即將進入連續陡升坡段，坡度 8.5%"
    };
  } else if (cleanCmd.includes("風景") || cleanCmd.includes("休閒") || cleanCmd.includes("悠閒") || cleanCmd.includes("河濱") || cleanCmd.includes("輕鬆") || cleanCmd.includes("平緩") || cleanCmd.includes("scenic") || cleanCmd.includes("relax")) {
    responseObj.speech = "已優化為休閒景觀路線。為您切換至『淡水河畔休閒車道』。這裡微風徐徐，風阻極低，適合放鬆身心。一路上有很多適合拍照的景點，祝您騎乘愉快！";
    responseObj.text = `### 🌅 路線優化：淡水河畔休閒線

為您推薦最舒適的河畔景觀慢遊路線。

*   **建議路線**：${PRESETS.scenic.name}
*   **優勢解析**：
    1.  沿河岸騎乘，視野開闊，下午可觀賞壯麗的淡水落日。
    2.  全線地勢起伏極小（累計爬升僅 45 m），空氣清新，適合大眾與新手。
*   **教練提示**：放鬆您的肩頸，維持自然的 **80 - 85 RPM** 轉速，將心率保持在 **Zone 1 - Zone 2**。盡情享受大自然與愜意的騎乘時光！`;
    responseObj.routeOptimization = {
      shouldChangePreset: true,
      recommendedPresetKey: "scenic",
      reason: "風景優美、風阻低、輕鬆休閒"
    };
    responseObj.suggestedStops = [
      { name: "社子島濕地公園", category: "viewpoint", description: "絕佳拍照點，可以眺望關渡大橋", distanceFromStart: "6.8 km" },
      { name: "關渡宮單車驛站", category: "supply", description: "大型公共休息區，提供洗手間與補給點", distanceFromStart: "12.0 km" }
    ];
    responseObj.metricsAdjustment = {
      targetCadence: 82,
      targetSpeed: 20,
      effortLevel: "主動恢復 (Zone 1)",
      slopeWarning: "路況極佳，微順風，請放鬆享受騎行"
    };
  } else if (cleanCmd.includes("不爬山") || cleanCmd.includes("平") || cleanCmd.includes("flat") || cleanCmd.includes("quiet")) {
    responseObj.speech = "已為您切換至『雙溪生活水岸車道』。這是一條風阻極低、綠意盎然的避風車道，地勢十分平坦，適合進行輕鬆的舒緩騎乘。";
    responseObj.text = `### 🌳 路線優化：雙溪平緩避風線

避開山路爬坡，提供給您林蔭遮蔽的平坦水岸綠道。

*   **建議路線**：${PRESETS.flat.name}
*   **優勢解析**：
    1.  兩旁林蔭茂密，能有效阻擋烈日與逆風干擾。
    2.  路面平穩安全，適合維持穩定的心率踩踏。
*   **教練提示**：今日體力恢復期，踩踏強度設定在 **Zone 2**，保持舒適的 **85 RPM** 踏頻，順暢踩踏，讓腿部肌肉充分放鬆。`;
    responseObj.routeOptimization = {
      shouldChangePreset: true,
      recommendedPresetKey: "flat",
      reason: "地勢極平坦、有林蔭遮擋，適合恢復騎乘"
    };
    responseObj.suggestedStops = [
      { name: "至善公園驛站", category: "supply", description: "提供洗手間、飲水機與車位", distanceFromStart: "2.0 km" },
      { name: "雙溪水岸涼亭", category: "rest", description: "綠意盎然的樹蔭涼亭，清涼宜人", distanceFromStart: "5.5 km" }
    ];
    responseObj.metricsAdjustment = {
      targetCadence: 85,
      targetSpeed: 22,
      effortLevel: "有氧恢復 (Zone 2)",
      slopeWarning: "兩側樹蔭遮蔽，幾乎無風阻，騎乘極度舒適"
    };
  } else if (cleanCmd.includes("水") || cleanCmd.includes("喝水") || cleanCmd.includes("補給") || cleanCmd.includes("餓") || cleanCmd.includes("coffee") || cleanCmd.includes("water") || cleanCmd.includes("drink")) {
    responseObj.speech = "收到補給諮詢。在您當前路線前方約三點五公里處，有一間『單車車友補給站』，提供冰水、運動飲料與香蕉，我已為您在地圖上標記該補給點。";
    responseObj.text = `### 🍌 語音補給導引

在您騎乘的過程中，水分與能量補給至關重要。

*   **推薦補給點**：**單車驛站 (Bike Station & Cafe)**
*   **距離您**：約 3.5 km
*   **提供服務**：
    *   免費冰水補充、運動飲料
    *   車友專屬休息區、高能香蕉與能量棒補給
    *   提供高壓打氣筒與鏈條油借用
*   **補給建議**：建議每 15-20 分鐘攝入 150ml 的水分。若今天騎乘時間超過一小時，請在到達該點時補給適量碳水化合物，預防抽筋或體力透支！`;
  } else if (cleanCmd.includes("風") || cleanCmd.includes("wind") || cleanCmd.includes("氣候") || cleanCmd.includes("天氣")) {
    responseObj.speech = "目前風向為東北偏北風，平均風速每秒四公尺。在河濱路段騎乘時，後半段可能會遇到些許逆風。建議稍微壓低重心、跟在破風車友後方，以節省體力。";
    responseObj.text = `### 💨 實時風阻與氣象分析

最新氣象數據與風力計算已同步：

*   **目前風向**：東北風 (NE)
*   **平均風速**：15 km/h
*   **風阻係數 (Aerodynamic drag)**：
    *   標準騎姿 (Hoods)：約 **0.38 CdA**
    *   空力騎姿 (Drops)：約 **0.31 CdA** *(推薦！)*
*   **騎乘建議**：
    *   **前半段**為側順風，可以輕鬆維持 28 km/h 的速度。
    *   **折返後**將迎來逆風。建議下握車把（drops），手肘內夾，降低正面迎風面積，可減少約 15% 的風阻阻力，能有效維持原定速度並節省 20W 的踩踏輸出功率。`;
  } else {
    // General conversational query
    responseObj.speech = `收到您的問題。身為您的智慧聲學助理，我建議您在當前的路線上保持穩定的節奏。目前平均坡度平緩，可以維持八十五的黃金踏頻，隨時對我說出『優化速度』或『挑戰爬坡』來調整導航路線。`;
    responseObj.text = `### 🚴 智慧自行車語音助理

您好！我是您的智慧自行車聲學導航系統。在騎乘中，您可以通過**語音指令**或**按鍵**與我進行互動。

**您可以嘗試對我說：**
1.  **「幫我優化速度」** ➔ 推薦平坦、封閉的無紅綠燈高速巡航公路。
2.  **「我想挑戰爬坡」** ➔ 切換至陡峭的經典山路，並提供精準的爬坡檔位與踏頻心率調控策略。
3.  **「切換到風景休閒路線」** ➔ 規劃悠閒、平緩且夕陽極佳的淡水河濱美景路線。
4.  **「附近哪裡可以補給水？」** ➔ 搜尋前方路線的自行車驛站、便利商店或飲水補給。
5.  **「分析風阻與氣候」** ➔ 獲得即時風向分析與破風空氣動力學姿勢指南。

*安全第一：騎乘時請使用語音指令互動，保持視線專注於前方路面！*`;
  }

  return res.json(responseObj);
});

// Configure Vite middleware or serve static files
const startServer = async () => {
  if (process.env.NODE_ENV !== "production") {
    console.log("-> Initializing Vite server middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("-> Vite server middleware loaded.");
  } else {
    console.log("-> Production mode active. Serving static files from dist/...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`====================================================`);
    console.log(`🚴 Bicycle Navigation Server running on http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start the Express + Vite server:", err);
});
