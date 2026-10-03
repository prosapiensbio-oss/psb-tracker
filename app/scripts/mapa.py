import math, io, urllib.request
from PIL import Image, ImageDraw

LAT, LON, Z = 49.2122241, 16.5731739, 17
W, H = 1024, 400           # 2x pre 512x200 na stránke
UA = "psb-kokpit/1.0 (prosapiensbio@gmail.com; jednorazova sadzba statickej mapky)"

def px(lat, lon, z):
    n = 2 ** z * 256
    x = (lon + 180) / 360 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y

cx, cy = px(LAT, LON, Z)
x0, y0 = cx - W / 2, cy - H / 2
t0x, t0y = int(x0 // 256), int(y0 // 256)
t1x, t1y = int((x0 + W) // 256), int((y0 + H) // 256)

plat = Image.new("RGB", ((t1x - t0x + 1) * 256, (t1y - t0y + 1) * 256))
for tx in range(t0x, t1x + 1):
    for ty in range(t0y, t1y + 1):
        url = f"https://tile.openstreetmap.org/{Z}/{tx}/{ty}.png"
        r = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(r, timeout=20) as f:
            t = Image.open(io.BytesIO(f.read())).convert("RGB")
        plat.paste(t, ((tx - t0x) * 256, (ty - t0y) * 256))

im = plat.crop((int(x0 - t0x * 256), int(y0 - t0y * 256),
                int(x0 - t0x * 256) + W, int(y0 - t0y * 256) + H))

d = ImageDraw.Draw(im, "RGBA")
# Špendlík v strede: zelená kvapka značky, biely lem, tieň pod ňou.
mx, my = W // 2, H // 2
d.ellipse((mx - 26, my - 10, mx + 26, my + 10), fill=(26, 46, 36, 70))
d.ellipse((mx - 30, my - 72, mx + 30, my - 12), fill=(45, 125, 90), outline=(255, 255, 255), width=7)
d.polygon([(mx - 16, my - 26), (mx + 16, my - 26), (mx, my + 4)], fill=(45, 125, 90))
d.ellipse((mx - 11, my - 53, mx + 11, my - 31), fill=(255, 255, 255))
# Povinný údaj o zdroji dlaždíc.
d.rectangle((W - 232, H - 30, W, H), fill=(255, 255, 255, 190))
d.text((W - 222, H - 22), "© OpenStreetMap", fill=(60, 76, 66))

im.save("public/mapa-studio.webp", "WEBP", quality=72, method=6)
print(im.size)
