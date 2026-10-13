# Bridges over the line, from the LIDAR

For the audit-fix session (`docs/briefs/real-surroundings.md`, Bridges over the line): every structure the Environment Agency's LIDAR shows over today's line from Hazel Grove to Piccadilly, against what the station kits draw there. Written by `node tools/osm-to-world.mjs --bridges --corridor 200 --from hazel-grove --to piccadilly` (13 October 2026): wherever the first-return DSM stands 3.5 m or more over the DTM at most of the tracks' centres and the last return agrees (a deck stops the laser; a tree's crown lets it through), for 3 to 60 m along the line. Stockport Viaduct and the arches into Piccadilly are left out (the DTM there is the ground below), and so are runs over 60 m, the arches and embankments near Ardwick and Piccadilly where the DTM keeps the ground.

The game draws no road bridges on the open line: only the kits' own (Heaton Moor Road's arches, the footbridges, the canopies and Piccadilly's shed). So every "no" below is a bridge over the line that isn't drawn, to check against the views from above (`docs/reference/aerial/`) and OpenStreetMap; none has been moved or added here. Chainage is along the line as the game measures it; the latitude and longitude are the middle of each.

| Along the line (m) | Width along (m) | Height over the rail (m) | Nearest station | Drawn by a kit |
| --- | --- | --- | --- | --- |
| 9939-9945 (53.38190, -2.13126) | 8 | 5.8 | hazel-grove +781 m | no |
| 10827-10833 (53.38651, -2.14217) | 8 | 5.8 | woodsmoor +74 m | no |
| 11707-11715 (53.39108, -2.15301) | 10 | 6.2 | davenport +69 m | no |
| 11719-11729 (53.39115, -2.15317) | 12 | 6.4 | davenport +82 m | no |
| 13465-13469 (53.40277, -2.16279) | 6 | 7.7 | stockport -298 m | stockport's box |
| 14641-14651 (53.41266, -2.16854) | 12 | 6.7 | stockport +881 m | no |
| 14873-14879 (53.41453, -2.17003) | 8 | 7.2 | stockport +1111 m | no |
| 15337-15345 (53.41831, -2.17300) | 10 | 6.6 | heaton-chapel -952 m | no |
| 15691-15695 (53.42115, -2.17533) | 6 | 7.1 | heaton-chapel -600 m | no |
| 16213-16223 (53.42539, -2.17881) | 12 | 9.5 | heaton-chapel -75 m | heaton-chapel's box |
| 16625-16631 (53.42868, -2.18157) | 8 | 6.1 | heaton-chapel +335 m | no |
| 17431-17441 (53.43520, -2.18694) | 12 | 5.6 | heaton-chapel +1143 m | no |
| 17915-17927 (53.43912, -2.19010) | 14 | 6.0 | levenshulme -672 m | no |
| 18079-18101 (53.44054, -2.19100) | 24 | 6.9 | levenshulme -503 m | no |
| 18307-18319 (53.44246, -2.19200) | 14 | 5.0 | levenshulme -280 m | no |
| 18497-18507 (53.44410, -2.19269) | 12 | 6.1 | levenshulme -91 m | levenshulme's box |
| 18549-18559 (53.44456, -2.19288) | 12 | 8.8 | levenshulme -39 m | levenshulme's canopy |
| 18819-18823 (53.44689, -2.19382) | 6 | 5.0 | levenshulme +228 m | no |
| 19365-19381 (53.45170, -2.19582) | 18 | 6.5 | levenshulme +780 m | no |
| 19651-19685 (53.45428, -2.19686) | 36 | 8.1 | levenshulme +1075 m | no |
| 19997-20009 (53.45717, -2.19826) | 14 | 5.6 | levenshulme +1410 m | no |
| 20307-20317 (53.45975, -2.19994) | 12 | 5.4 | ardwick -1547 m | no |
| 21669-21713 (53.46986, -2.21177) | 46 | 6.3 | ardwick -168 m | no |
| 21719-21751 (53.47014, -2.21223) | 34 | 6.4 | ardwick -124 m | no |
| 21755-21763 (53.47030, -2.21248) | 10 | 6.3 | ardwick -100 m | no |
| 21767-21825 (53.47053, -2.21287) | 60 | 5.9 | ardwick -63 m | no |
| 22917-22931 (53.47648, -2.22655) | 16 | 7.0 | piccadilly -243 m | piccadilly's canopy |
| 22937-22949 (53.47654, -2.22682) | 14 | 10.9 | piccadilly -224 m | piccadilly's canopy |
| 22953-22983 (53.47661, -2.22718) | 32 | 11.1 | piccadilly -199 m | piccadilly's shed |
| 22989-23013 (53.47670, -2.22766) | 26 | 11.2 | piccadilly -166 m | piccadilly's shed |
| 23017-23025 (53.47676, -2.22794) | 10 | 11.5 | piccadilly -146 m | piccadilly's shed |

Longer than 60 m, left out as arches or embankments: 21177-21443, 21447-21663, 21831-21945, 22515-22621, 22627-22913, 23033-23131

Notes:

- Davenport (+69 m and +82 m) is Bramhall Lane, which the kit's note names but draws no part over the tracks for; Woodsmoor (+74 m) is Moorland Road, likewise. Heaton Chapel (-75 m) is Heaton Moor Road, drawn (its arches are listed as the kit's box).
- Two runs a few metres apart (Davenport's, Piccadilly's) are one bridge with a gap in the LIDAR between its parapets.
- Heights are the deck's top over the rail as the LIDAR has it; where a bridge stands in a cutting the parapet may read higher than the road.
