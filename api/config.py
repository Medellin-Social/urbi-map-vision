import os

# COP/USD exchange rate — set USD_TO_COP in .env and Railway env vars
USD_TO_COP = float(os.getenv("USD_TO_COP", "4100"))
