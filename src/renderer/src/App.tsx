import { useEffect, useState, useCallback } from "react";
import type { PetState, PetFacing, SpeechBubble, PetLayout, Settings, AppSnapshot } from "../../shared/types";

// Declare the API exposed by preload
declare global {
  interface Window {
    pencilPet: {
      getSnapshot: () => Promise<AppSnapshot>;
      getSettings: () => Promise<Settings>;
      setSettings: (settings: Settings) => void;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
      send: (channel: string, ...args: unknown[]) => void;
      getAssetDataUrl: (filename: string) => Promise<string | null>;
    };
  }
}

// Map state to image filename
const STATE_TO_IMAGE: Record<PetState, string> = {
  idle: "stay.png",
  sitting: "stay.png",
  thinking: "work.png",
  working: "work.png",
  happy: "play.png",
  waving: "play.png",
  failed: "stay.png",
  waiting: "work.png",
  runningLeft: "play.png",
  runningRight: "play.png",
  resting: "stay.png",
  sleeping: "stay.png",
  stretching: "play.png",
  held: "play.png"
};

export default function App() {
  const [petState, setPetState] = useState<PetState>("idle");
  const [currentImage, setCurrentImage] = useState<string>("stay.png");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [petFacing, setPetFacing] = useState<PetFacing>("right");
  const [bubble, setBubble] = useState<SpeechBubble | null>(null);
  const [layout, setLayout] = useState<PetLayout>({ petOffsetX: 0, bubbleAnchorX: 0, bubbleLeftX: 0, bubbleArrowX: 0 });
  const [settings, setSettings] = useState<Settings | null>(null);

  // Load image when it changes
  useEffect(() => {
    const loadImage = async () => {
      try {
        const url = await window.pencilPet.getAssetDataUrl(currentImage);
        console.log("Got Data URL, length:", url?.length);
        if (url) setImageUrl(url);
      } catch (err) {
        console.error("Failed to load image:", err);
      }
    };
    loadImage();
  }, [currentImage]);
  
  // Subscribe to IPC events
  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    unsubscribers.push(
      window.pencilPet.on("pet:set-state", (data) => {
        const payload = data as { state: PetState; image: string } | PetState;
        if (typeof payload === "object" && "state" in payload) {
          setPetState(payload.state);
          setCurrentImage(payload.image);
        } else {
          const state = payload as PetState;
          setPetState(state);
          setCurrentImage(STATE_TO_IMAGE[state] || "stay.png");
        }
      })
    );

    unsubscribers.push(
      window.pencilPet.on("pet:layout", (newLayout) => {
        setLayout(newLayout as PetLayout);
      })
    );

    unsubscribers.push(
      window.pencilPet.on("pet:show-bubble", (b) => {
        setBubble(b as SpeechBubble);
      })
    );

    unsubscribers.push(
      window.pencilPet.on("pet:hide-bubble", () => {
        setBubble(null);
      })
    );

    unsubscribers.push(
      window.pencilPet.on("settings:updated", (s) => {
        setSettings(s as Settings);
      })
    );

    unsubscribers.push(
      window.pencilPet.on("app:snapshot", (snapshot) => {
        const snap = snapshot as AppSnapshot;
        setPetState(snap.petState);
        setPetFacing(snap.petFacing);
        setSettings(snap.settings);
        setCurrentImage(STATE_TO_IMAGE[snap.petState] || "stay.png");
      })
    );

    // Get initial state
    window.pencilPet.getSnapshot().then((snapshot) => {
      setPetState(snapshot.petState);
      setPetFacing(snapshot.petFacing);
      setSettings(snapshot.settings);
      setCurrentImage(STATE_TO_IMAGE[snapshot.petState] || "stay.png");
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  // Handle mouse down for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    window.pencilPet.send("pet:drag-start", { offsetX: e.nativeEvent.offsetX, offsetY: e.nativeEvent.offsetY });
  }, []);

  // Handle right click for context menu
  const handleContextMenu = useCallback(() => {
    window.pencilPet.send("pet:context-menu");
  }, []);

  // Scale based on settings
  const scale = settings?.petScale ?? 1;
  const displayWidth = Math.round(200 * scale);
  const displayHeight = Math.round(200 * scale);

  return (
    <>
      {bubble && (
        <div className="bubble">
          {bubble.message}
        </div>
      )}
      <div 
        className="pet-container"
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
      >
        {imageUrl ? (
          <img
            key={currentImage}
            src={imageUrl}
            alt={`Pet ${petState}`}
            className="pet-image"
            style={{
              width: displayWidth,
              height: displayHeight,
              transform: petFacing === "left" ? "scaleX(-1)" : "scaleX(1)"
            }}
          />
        ) : (
          <div 
            className="pet-fallback" 
            style={{ width: displayWidth, height: displayHeight }}
          >
            🐱
          </div>
        )}
      </div>
    </>
  );
}
