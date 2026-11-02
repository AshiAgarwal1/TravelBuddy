from .http import get_json

CODES = {0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Rime fog",
         51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
         66: "Freezing rain", 67: "Heavy freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
         80: "Light showers", 81: "Showers", 82: "Violent showers", 85: "Snow showers", 86: "Heavy snow showers",
         95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail"}


async def forecast(lat, lon):
    d = await get_json("https://api.open-meteo.com/v1/forecast", {
        "latitude": lat, "longitude": lon, "timezone": "auto", "forecast_days": 7,
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    }, service="Open-Meteo")
    cur = d["current"]
    daily = d["daily"]
    return {
        "timezone": d.get("timezone"),
        "current": {**cur, "label": CODES.get(cur["weather_code"], "Unknown")},
        "units": d.get("current_units", {}),
        "daily": [
            {"date": daily["time"][i], "label": CODES.get(daily["weather_code"][i], "Unknown"),
             "max": daily["temperature_2m_max"][i], "min": daily["temperature_2m_min"][i],
             "rain_chance": daily["precipitation_probability_max"][i],
             "sunrise": daily["sunrise"][i], "sunset": daily["sunset"][i]}
            for i in range(len(daily["time"]))
        ],
        "source": "Open-Meteo",
    }
