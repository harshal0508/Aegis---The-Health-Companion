"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface PdfPageViewerProps {
  url: string;
  pageNo: number;
  zoomLevel: number;
  activeBoxes: Array<{ x: number; y: number; w: number; h: number }> | null;
}

export function PdfPageViewer({ url, pageNo, zoomLevel, activeBoxes }: PdfPageViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Load PDF.js from CDN if not already on window
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).pdfjsLib) {
      setPdfJsLoaded(true);
      return;
    }

    // Check if script tag is already attached
    const existingScript = document.querySelector('script[src*="pdf.min.js"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        const pdfjs = (window as any).pdfjsLib;
        if (pdfjs) {
          pdfjs.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          setPdfJsLoaded(true);
        }
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.async = true;
    script.onload = () => {
      const pdfjs = (window as any).pdfjsLib;
      if (pdfjs) {
        pdfjs.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        setPdfJsLoaded(true);
      }
    };
    script.onerror = () => {
      setError(true);
      setLoading(false);
    };
    document.head.appendChild(script);
  }, []);

  // Render page to canvas
  useEffect(() => {
    if (!pdfJsLoaded || !url || !(window as any).pdfjsLib) return;
    let cancel = false;

    async function renderPage() {
      try {
        setLoading(true);
        setError(false);
        const pdfjs = (window as any).pdfjsLib;
        const loadingTask = pdfjs.getDocument({ url, withCredentials: false });
        const pdf = await loadingTask.promise;
        if (cancel) return;

        const targetPage = Math.min(Math.max(1, pageNo), pdf.numPages);
        const page = await pdf.getPage(targetPage);
        if (cancel) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Render at 2x resolution for retina sharpness
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = 2.0;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${unscaledViewport.width}px`;
        canvas.style.height = `${unscaledViewport.height}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancel) setLoading(false);
      } catch (err) {
        console.warn("[PdfPageViewer] Failed to render PDF on canvas, falling back to iframe:", err);
        if (!cancel) {
          setError(true);
          setLoading(false);
        }
      }
    }

    renderPage();
    return () => {
      cancel = true;
    };
  }, [pdfJsLoaded, url, pageNo]);

  // If PDF.js fails or cannot load, fallback cleanly to standard iframe
  if (error) {
    return (
      <iframe
        src={url}
        className="w-full h-[650px] rounded-lg border bg-white"
        title={`PDF Document`}
      />
    );
  }

  return (
    <div
      className="transition-transform duration-150 flex items-center justify-center max-w-full"
      style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: "top center" }}
    >
      <div className="relative inline-block max-w-full">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-xs z-10 rounded-lg min-h-[400px] min-w-[300px]">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="max-w-full h-auto rounded-lg shadow-md border bg-white block select-none"
        />

        {/* Highlight Box Overlay for Active Extracted Record */}
        {!loading &&
          activeBoxes &&
          activeBoxes.map((box, idx) => (
            <div
              key={idx}
              className="absolute border-2 border-teal-500 bg-teal-400/35 rounded pointer-events-none transition-all duration-300 ring-4 ring-teal-300/40 animate-pulse"
              style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.w * 100}%`,
                height: `${box.h * 100}%`,
              }}
              title="Verbatim location on page scan"
            />
          ))}
      </div>
    </div>
  );
}
