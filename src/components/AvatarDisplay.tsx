"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function AvatarDisplay({ profile, className = "h-12 w-12" }: { profile: any; className?: string }) {
  if (!profile?.avatar_config) {
    return (
      <Avatar className={className}>
        <AvatarImage src={profile?.avatar_url} />
        <AvatarFallback className="bg-indigo-900 text-white font-black uppercase tracking-tighter">
          {profile?.username?.substring(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
    );
  }

  const config = profile.avatar_config;
  
  const backgrounds: Record<string, string> = {
    none: "bg-zinc-950",
    neon: "bg-gradient-to-br from-purple-900 via-indigo-900 to-black",
    sunset: "bg-gradient-to-br from-orange-500 via-red-600 to-purple-900",
    ocean: "bg-gradient-to-br from-blue-600 via-cyan-500 to-indigo-900",
    forest: "bg-gradient-to-br from-emerald-600 via-teal-800 to-black",
    candy: "bg-gradient-to-br from-pink-400 via-purple-400 to-indigo-900",
  };

  const wearColors: Record<string, string> = {
    hoodie: "#4f46e5",
    tshirt: "#dc2626",
    suit: "#18181b",
    jacket: "#ca8a04",
    kurta: "#c2410c",
    sari: "#be185d",
    vest: "#10b981",
    dress: "#8b5cf6",
  };

  const bottomColors: Record<string, string> = {
    jeans: "#1e3a8a",
    shorts: "#374151",
    sweats: "#4b5563",
    cargo: "#3f6212",
    formal: "#18181b",
  };

  const bgClass = backgrounds[config.background] || "bg-zinc-950";
  const wearColor = wearColors[config.wear] || "#4f46e5";
  const bottomColor = bottomColors[config.bottoms] || "#1e3a8a";

  const Hand = ({ x, y, rotation = 0, scale = 1 }: { x: number, y: number, rotation?: number, scale?: number }) => (
    <g transform={`translate(${x}, ${y}) rotate(${rotation}) scale(${scale})`}>
      <path d="M-8,-4 Q-12,0 -8,4 L4,4 Q8,4 8,0 L8,-4 Q8,-8 4,-8 L-4,-8 Q-8,-8 -8,-4" fill={config.skin} />
      <path d="M-6,-8 Q-7,-15 -4,-15 L-2,-15 Q0,-15 0,-8" fill={config.skin} />
      <path d="M0,-8 Q1,-18 4,-18 L6,-18 Q8,-18 8,-8" fill={config.skin} />
      <path d="M8,-8 Q9,-18 12,-18 L14,-18 Q16,-18 16,-8" fill={config.skin} />
      <path d="M16,-8 Q17,-16 20,-16 L22,-16 Q24,-16 24,-8" fill={config.skin} />
      <path d="M24,-8 Q25,-14 28,-14 L30,-14 Q32,-14 32,-8" fill={config.skin} />
    </g>
  );

  return (
    <div className={`${className} rounded-full overflow-hidden relative border-2 border-border shadow-xl ${bgClass}`}>
      <svg viewBox="0 0 200 300" className="w-full h-full drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]">
        <g>
          <path d="M75,200 Q70,225 65,260 Q75,265 85,260 Q80,230 85,200 Z" fill={config.skin} />
          <path d="M125,200 Q130,225 135,260 Q125,265 115,260 Q120,230 115,200 Z" fill={config.skin} />
          
          {config.wear !== 'dress' && (
            <g>
              <path d="M70,180 Q65,210 60,255 L85,255 Q90,210 90,180 Z" fill={bottomColor} />
              <path d="M110,180 Q115,210 120,255 L145,255 Q135,210 130,180 Z" fill={bottomColor} />
              <path d="M72,225 L82,225" stroke="rgba(0,0,0,0.1)" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M118,225 L128,225" stroke="rgba(0,0,0,0.1)" strokeWidth="2.5" strokeLinecap="round" />
            </g>
          )}
        </g>
        
        <g transform="translate(0, 5)">
          {config.shoes === 'sneakers' && (
            <>
              <path d="M55,255 Q55,270 85,270 L85,255 Z" fill="#fff" />
              <path d="M115,255 L115,270 Q145,270 145,255 Z" fill="#fff" />
            </>
          )}
          {config.shoes === 'boots' && (
            <>
              <path d="M55,250 L85,250 L85,275 L55,275 Z" fill="#422006" />
              <path d="M115,250 L145,250 L145,275 L115,275 Z" fill="#422006" />
            </>
          )}
          {config.shoes === 'loafers' && (
            <>
              <path d="M58,255 Q58,268 82,268 L82,255 Z" fill="#000" />
              <path d="M118,255 L118,268 Q142,268 142,255 Z" fill="#000" />
            </>
          )}
          {config.shoes === 'sandals' && (
            <>
              <path d="M55,265 L85,265 L85,270 L55,270 Z" fill="#78350f" />
              <path d="M115,265 L145,265 L145,270 L115,270 Z" fill="#78350f" />
            </>
          )}
        </g>

        <path d="M60,130 Q100,115 140,130 L155,200 Q100,215 45,200 Z" fill={config.skin} />

        {config.wear === 'dress' ? (
          <path d="M60,130 Q100,110 140,130 L175,260 L25,260 Z" fill={wearColor} />
        ) : (
          <path d="M60,130 Q100,118 140,130 L155,200 Q100,215 45,200 Z" fill={wearColor} />
        )}

          <g strokeWidth="14" strokeLinecap="round" fill="none">
            {config.pose === 'standing' && (
              <>
                <path d="M60,135 Q40,165 45,195" stroke={config.skin} />
                <Hand x={45} y={205} rotation={180} scale={0.4} />
                <path d="M140,135 Q160,165 155,195" stroke={config.skin} />
                <Hand x={155} y={205} rotation={0} scale={0.4} />
              </>
            )}
            {config.pose === 'wave' && (
              <>
                <path d="M60,135 Q40,165 45,195" stroke={config.skin} />
                <Hand x={45} y={205} rotation={180} scale={0.4} />
                <path d="M140,135 Q175,110 185,75" stroke={config.skin} />
                <Hand x={185} y={65} rotation={-45} scale={0.5} />
              </>
            )}
            {config.pose === 'peace' && (
              <>
                <path d="M60,135 Q40,165 45,195" stroke={config.skin} />
                <Hand x={45} y={205} rotation={180} scale={0.4} />
                <path d="M140,135 Q185,155 175,105" stroke={config.skin} />
              </>
            )}
            {config.pose === 'cool' && (
              <>
                <path d="M60,135 Q25,155 50,175" stroke={config.skin} />
                <Hand x={50} y={180} rotation={90} scale={0.4} />
                <path d="M140,135 Q175,155 150,175" stroke={config.skin} />
                <Hand x={150} y={180} rotation={-90} scale={0.4} />
              </>
            )}
          </g>

        <path d="M92,110 Q100,125 108,110 L108,125 Q100,130 92,125 Z" fill={config.skin} />
        
        <g>
          <circle cx="55" cy="75" r="8" fill={config.skin} />
          <circle cx="145" cy="75" r="8" fill={config.skin} />
          <path d="M60,75 Q60,125 100,125 Q140,125 140,75 Q140,25 100,25 Q60,25 60,75" fill={config.skin} />
          
          <path d="M55,70 Q100,-5 145,70 Q155,105 130,110 Q120,80 100,80 Q80,80 70,110 Q45,105 55,70" fill={config.hairColor} />

          <g transform="translate(82, 75)">
            <circle cx="0" cy="0" r="6" fill="#fff" />
            <circle cx="1" cy="0" r="3" fill="#000" />
          </g>
          <g transform="translate(118, 75)">
            <circle cx="0" cy="0" r="6" fill="#fff" />
            <circle cx="-1" cy="0" r="3" fill="#000" />
          </g>
          
          <path d="M97,90 Q100,98 103,90" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="2.5" strokeLinecap="round" />
          
          {config.goggles === 'shades' && (
            <g transform="translate(0, -2)">
              <path d="M65,70 Q80,65 95,70 L95,85 Q80,95 65,85 Z" fill="#111" />
              <path d="M105,70 Q120,65 135,70 L135,85 Q120,95 105,85 Z" fill="#111" />
            </g>
          )}
          {config.goggles === 'glasses' && (
            <g transform="translate(0, -2)">
              <path d="M70,70 L95,70 L95,85 L70,85 Z" fill="none" stroke="#333" strokeWidth="2" />
              <path d="M105,70 L130,70 L130,85 L105,85 Z" fill="none" stroke="#333" strokeWidth="2" />
            </g>
          )}

          <path d="M85,108 Q100,120 115,108" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
        </g>

        <g>
          {config.hat === 'cap' && <path d="M60,65 Q100,15 140,65" fill="#18181b" />}
          {config.hat === 'beanie' && <path d="M55,70 Q100,-10 145,70 Q145,95 100,95 Q55,95 55,70" fill="#374151" />}
        </g>
      </svg>
    </div>
  );
}
