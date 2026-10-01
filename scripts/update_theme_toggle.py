from pathlib import Path
p = Path('/home/ubuntu/samutsongkhram-tech-campus/client/src/pages/KioskHome.tsx')
s = p.read_text()
s = s.replace('MapPin, Mic, Navigation', 'MapPin, Mic, Moon, Navigation')
s = s.replace('Search, Sparkles, Volume2', 'Search, Sparkles, Sun, Volume2')
old = '<button type="button" onClick={toggleTheme} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10" aria-label="สลับโหมดสี">{theme === "dark" ? "☀" : "☾"}</button>'
new = '<button type="button" onClick={toggleTheme} className="flex h-10 items-center gap-2 rounded-full bg-white/10 px-3 text-xs font-black transition-colors hover:bg-white/20" aria-label={`สลับเป็นโหมด${theme === "dark" ? "สว่าง" : "มืด"}`} title={`สลับเป็นโหมด${theme === "dark" ? "สว่าง" : "มืด"}`}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}<span className="hidden sm:inline">{theme === "dark" ? "โหมดสว่าง" : "โหมดมืด"}</span></button>'
if old not in s:
    raise SystemExit('toggle markup not found')
p.write_text(s.replace(old, new))
print('updated')
