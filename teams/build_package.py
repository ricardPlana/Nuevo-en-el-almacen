"""Genera el paquete de la app de Teams "Almacén 3D" (teams/build/almacen3d.zip).

Lee los valores de teams/teams.env (KEY=VALUE, no se sube a git) o de variables de entorno:
  TEAMS_APP_ID     GUID de la app (uuidgen / New-Guid). Es también TEAMS_APP_ID en la SWA.
  SWA_HOST         host de la SWA, p. ej. salmon-sea-0123.1.azurestaticapps.net
  ENTRA_CLIENT_ID  clientId de wh3d-app
  BOT_ID           opcional: App ID del bot de Copilot Studio. Sin él, la app va sin bot.
  APP_VERSION      opcional (por defecto 1.0.0). Súbela cada vez que vuelvas a subir el zip.

Uso: python teams/build_package.py
"""
import json, os, re, sys, zipfile, pathlib

HERE = pathlib.Path(__file__).parent
GUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def settings():
    values = {}
    env_file = HERE / "teams.env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                values[k.strip()] = v.strip()
    for k in ("TEAMS_APP_ID", "SWA_HOST", "ENTRA_CLIENT_ID", "BOT_ID", "APP_VERSION"):
        if os.environ.get(k):
            values[k] = os.environ[k]
    return values


def main():
    s = settings()
    errors = []
    for k in ("TEAMS_APP_ID", "ENTRA_CLIENT_ID"):
        if not GUID.match(s.get(k, "")):
            errors.append(f"{k} tiene que ser un GUID (ahora: {s.get(k, '<vacío>')!r})")
    host = s.get("SWA_HOST", "").removeprefix("https://").rstrip("/")
    if not host or "/" in host:
        errors.append(f"SWA_HOST tiene que ser solo el host (ahora: {s.get('SWA_HOST', '<vacío>')!r})")
    bot = s.get("BOT_ID", "")
    if bot and not GUID.match(bot):
        errors.append(f"BOT_ID tiene que ser un GUID (ahora: {bot!r})")
    if errors:
        sys.exit("No genero el paquete:\n  - " + "\n  - ".join(errors) + "\nRellena teams/teams.env (ver teams/teams.env.example).")

    text = (HERE / "manifest.json").read_text(encoding="utf-8")
    text = (text.replace("REPLACE-TEAMS-APP-ID-GUID", s["TEAMS_APP_ID"])
                .replace("REPLACE-wh3d-app-CLIENT-ID", s["ENTRA_CLIENT_ID"])
                .replace("REPLACE-swa.azurestaticapps.net", host)
                .replace("REPLACE-COPILOT-STUDIO-BOT-APP-ID", bot or "REPLACE-COPILOT-STUDIO-BOT-APP-ID"))
    manifest = json.loads(text)
    manifest["version"] = s.get("APP_VERSION", manifest.get("version", "1.0.0"))
    if not bot:
        manifest["bots"] = []
    leftovers = re.findall(r"REPLACE-[\w.-]+", json.dumps(manifest))
    if leftovers:
        sys.exit(f"Quedan valores sin rellenar en el manifest: {sorted(set(leftovers))}")

    out = HERE / "build"
    out.mkdir(exist_ok=True)
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    zip_path = out / "almacen3d.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(out / "manifest.json", "manifest.json")  # en la raíz del zip, no en una carpeta
        z.write(HERE / "color.png", "color.png")
        z.write(HERE / "outline.png", "outline.png")
    print(f"OK {zip_path}  (versión {manifest['version']}, bot: {'sí' if bot else 'no'})")


if __name__ == "__main__":
    main()
