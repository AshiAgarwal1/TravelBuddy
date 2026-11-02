# (general, police, ambulance, fire). Static reference list: always verify locally.
_EU = ("112", None, None, None)
NUMBERS = {
    "us": ("911", None, None, None), "ca": ("911", None, None, None), "mx": ("911", None, None, None), "ph": ("911", None, None, None),
    "gb": ("999 or 112", None, None, None), "ie": ("112 or 999", None, None, None),
    "au": ("000", None, None, None), "nz": ("111", None, None, None), "my": ("999", None, None, None),
    "in": ("112", "100", "102 / 108", "101"), "jp": (None, "110", "119", "119"),
    "cn": (None, "110", "120", "119"), "kr": (None, "112", "119", "119"),
    "th": (None, "191", "1669", "199"), "vn": (None, "113", "115", "114"),
    "id": ("112", "110", "118 / 119", "113"), "sg": (None, "999", "995", "995"),
    "ch": ("112", "117", "144", "118"), "tr": ("112", None, None, None), "ru": ("112", None, None, None),
    "eg": (None, "122", "123", "180"), "ma": (None, "19 (city) / 177", "15", "15"),
    "za": ("112 (mobile)", "10111", "10177", None), "ke": ("999 or 112", None, None, None), "ng": ("112", "199", None, None),
    "ae": (None, "999", "998", "997"), "sa": ("911", "999", "997", "998"), "il": (None, "100", "101", "102"),
    "br": (None, "190", "192", "193"), "ar": (None, "101", "107", "100"), "cl": (None, "133", "131", "132"),
    "co": ("123", None, None, None), "pe": (None, "105", "106", "116"),
    "no": (None, "112", "113", "110"),
}
for c in "at be bg hr cy cz dk ee fi fr de gr hu it lv lt lu mt nl pl pt ro sk si es se is".split():
    NUMBERS.setdefault(c, _EU)


def lookup(code: str):
    n = NUMBERS.get((code or "").lower())
    if not n:
        return None
    keys = ("general", "police", "ambulance", "fire")
    return {k: v for k, v in zip(keys, n) if v}
