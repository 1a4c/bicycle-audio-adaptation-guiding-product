export interface Waypoint {
  name: string;
  lat: number;
  lng: number;
}

export interface PresetRoute {
  name: string;
  distance: string;
  elevationGain: string;
  avgSlope: string;
  windCoef: string;
  description: string;
  waypoints: Waypoint[];
}

export interface SuggestedStop {
  name: string;
  category: string; // 'supply' | 'rest' | 'viewpoint' | 'bikeshop'
  description: string;
  distanceFromStart: string;
}

export interface MetricsAdjustment {
  targetCadence: number;
  targetSpeed: number;
  effortLevel: string;
  slopeWarning?: string;
}

export interface RouteOptimization {
  shouldChangePreset: boolean;
  recommendedPresetKey?: 'scenic' | 'fastest' | 'flat' | 'mountain';
  reason?: string;
}

export interface AssistantResponse {
  speech: string;
  text: string;
  routeOptimization?: RouteOptimization;
  suggestedStops?: SuggestedStop[];
  metricsAdjustment?: MetricsAdjustment;
  error?: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  speech?: string;
  timestamp: Date;
  routeOptimization?: RouteOptimization;
}
