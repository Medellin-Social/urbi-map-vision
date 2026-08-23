import os

# Fallback estático — solo se usa si public.trm no responde (ver api/routers/trm.py)
USD_TO_COP = float(os.getenv("USD_TO_COP", "4100"))
EUR_TO_COP = float(os.getenv("EUR_TO_COP", "4500"))
