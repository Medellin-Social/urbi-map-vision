import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "es" | "en";
const KEY = "urbidata.lang";

/* ---------- Spanish → English dictionary ----------
 * Order matters: longer phrases first to avoid partial replacements
 * inside larger ones. Keep all-lowercase keys are matched
 * case-insensitively at word boundaries; cased keys match exactly.
 */
const PHRASES: Array<[string, string]> = [
  // Brand / taglines
  ["Urbidata · Inteligencia inmobiliaria de Medellín", "Urbidata · Real estate intelligence for Medellín"],
  ["Urbidata · Invierte en Medellín con datos reales", "Urbidata · Invest in Medellín with real data"],
  ["Inteligencia inmobiliaria de Medellín", "Real estate intelligence for Medellín"],
  ["Invierte en Medellín con datos reales", "Invest in Medellín with real data"],
  ["El primer motor de decisión inmobiliaria para el Valle de Aburrá. Yields, precios justos, seguridad y oportunidades por barrio.",
    "The first real-estate decision engine for the Aburrá Valley. Yields, fair prices, safety and opportunities by neighborhood."],
  ["El primer motor de decisión inmobiliaria para el Valle de Aburrá",
    "The first real-estate decision engine for the Aburrá Valley"],
  ["Motor de decisión inmobiliaria para el Valle de Aburrá.",
    "Real-estate decision engine for the Aburrá Valley."],
  ["Plataforma de analítica geoespacial para inversión inmobiliaria en Medellín. Yields, precios y oportunidades por barrio en tiempo real.",
    "Geospatial analytics platform for real-estate investment in Medellín. Yields, prices and opportunities by neighborhood in real time."],
  ["Yields, precios y oportunidades por barrio en Medellín.",
    "Yields, prices and opportunities by neighborhood in Medellín."],
  ["Medellín · Valle de Aburrá", "Medellín · Aburrá Valley"],
  ["Urbidata © 2026 · Medellín, Colombia", "Urbidata © 2026 · Medellín, Colombia"],

  // Onboarding
  ["¿Cuál es tu objetivo principal?", "What is your main goal?"],
  ["¿Cuál es tu perfil de riesgo?", "What is your risk profile?"],
  ["¿Cuál es tu presupuesto de inversión?", "What is your investment budget?"],
  ["Personalizamos la analítica según tu estrategia.", "We tailor the analytics to your strategy."],
  ["Determina qué barrios destacaremos primero.", "Determines which neighborhoods we highlight first."],
  ["Maximiza ingresos con renta corta. Analizamos ocupación real, ADR por barrio y demanda turística para identificar las zonas con mayor potencial Airbnb.",
    "Maximize income with short-term rentals. We analyze real occupancy, ADR by neighborhood and tourist demand to identify the areas with the highest Airbnb potential."],
  ["Arriendos de 1 a 6 meses para ejecutivos, nómadas digitales y profesionales en movilidad.",
    "1 to 6 month rentals for executives, digital nomads and mobile professionals."],
  ["Ingreso estable con menor gestión. Identificamos barrios donde el precio está bajo el valor justo (PBN) con alta seguridad residencial.",
    "Stable income with less management. We identify neighborhoods where the price is below fair value (PBN) with high residential safety."],
  ["Renta corta, alta rotación", "Short-term rental, high turnover"],
  ["Yield + apreciación", "Yield + appreciation"],
  ["Tipo de inversión", "Investment type"],
  ["Renta media · 1-6 meses", "Mid-term rental · 1-6 months"],
  ["Renta media", "Mid-term rental"],

  // Calculator
  ["Simula tu inversión", "Simulate your investment"],
  ["Calculadora de inversión", "Investment calculator"],
  ["Calculadora", "Calculator"],
  ["Inversión inicial", "Initial investment"],
  ["Apartamento típico", "Typical apartment"],
  ["Años recupero", "Payback years"],
  ["Apreciación a 5–10 años", "Appreciation in 5–10 years"],
  ["Valorización proyectada", "Projected appreciation"],
  ["Valorización", "Appreciation"],
  ["Sin valorización", "No appreciation"],
  ["Comparación vs CDT", "Comparison vs CDT"],
  ["Tu inversión", "Your investment"],
  ["Retorno 5 años", "5-year return"],
  ["Yield real, precio justo (PBN), años de recupero, proyección a 5 años y comparación vs CDT bancario.",
    "Real yield, fair price (PBN), payback years, 5-year projection and comparison vs bank CDT."],
  ["o con intuición?", "or with intuition?"],
  ["Simulación Urbidata", "Urbidata simulation"],
  ["📈 valorización anual", "📈 average annual appreciation"],

  // Map / floating panel
  ["Cómo funciona Urbidata", "How Urbidata works"],
  ["Cómo funciona", "How it works"],
  ["Selecciona un barrio en el mapa para ver análisis detallado.",
    "Select a neighborhood on the map to see detailed analysis."],
  ["Cada barrio muestra su score de inversión según TU perfil. Verde = oportunidad. Rojo = evitar.",
    "Each neighborhood shows its investment score based on YOUR profile. Green = opportunity. Red = avoid."],
  ["Según tu perfil de inversión", "Based on your investor profile"],
  ["¿Cómo calculamos esto?", "How do we calculate this?"],
  ["Distancia al metro >2km puede afectar ocupación Airbnb.",
    "Metro distance >2 km may affect Airbnb occupancy."],
  ["📈 Para valorización, El Rodeo y Robledo muestran el mayor potencial de apreciación a 5 años.",
    "📈 For appreciation, El Rodeo and Robledo show the highest 5-year potential."],
  ["3,239 puntos de interés urbano", "3,239 urban points of interest"],
  ["Mall más cercano", "Nearest mall"],
  ["Metro más cercano", "Nearest metro"],
  ["Parque más cercano", "Nearest park"],
  ["Área estim.", "Est. area"],
  ["Métrica", "Metric"],
  ["Robledo · Medellín", "Robledo · Medellín"],

  // Opportunities
  ["INVERSIÓN SEGURA", "SAFE INVESTMENT"],
  ["PRECIO BAJO MERCADO", "BELOW-MARKET PRICE"],
  ["ALTO RENDIMIENTO", "HIGH YIELD"],
  ["Cotiza 43% bajo el precio justo según arriendo de la zona",
    "Listed 43% below the fair price for area rents"],
  ["Yield 8.4% — sobre promedio Medellín (6.8%)",
    "Yield 8.4% — above Medellín average (6.8%)"],
  ["Fácil de vender", "Easy to sell"],
  ["Difícil de vender", "Hard to sell"],
  ["Tarda en vender", "Slow to sell"],
  ["Tiempo razonable", "Reasonable time"],
  ["Balance entre yield y precio (Estadio, Belén).", "Balance between yield and price (Estadio, Belén)."],

  // Auth
  ["Iniciar sesión", "Sign in"],
  ["Crear cuenta", "Create account"],
  ["Crear una cuenta", "Create an account"],
  ["Bienvenido de vuelta a Urbidata", "Welcome back to Urbidata"],
  ["Ingresa tu correo y contraseña.", "Enter your email and password."],
  ["Las contraseñas no coinciden", "Passwords do not match"],
  ["Mínimo 8 caracteres", "Minimum 8 characters"],
  ["Confirmar contraseña", "Confirm password"],
  ["Nueva contraseña", "New password"],
  ["Contraseña", "Password"],
  ["Correo", "Email"],
  ["Nombre completo", "Full name"],
  ["Nombre", "Name"],
  ["Entrar", "Enter"],
  ["¿Sin cuenta?", "No account?"],
  ["¿Ya tienes cuenta?", "Already have an account?"],
  ["Inicia sesión", "Sign in"],

  // Profile / settings
  ["Configuración de cuenta", "Account settings"],
  ["Configuración del mapa", "Map settings"],
  ["Configuración mapa", "Map settings"],
  ["Configuración", "Settings"],
  ["Métodos de pago", "Payment methods"],
  ["Foto, nombre, correo y contraseña.", "Photo, name, email and password."],
  ["Tarjetas y métodos para suscripciones premium y reportes.",
    "Cards and methods for premium subscriptions and reports."],
  ["Tus últimas búsquedas, simulaciones y favoritos.",
    "Your latest searches, simulations and favorites."],
  ["Barrios guardados con tu configuración exacta.",
    "Neighborhoods saved with your exact configuration."],
  ["Nuevo método de pago", "New payment method"],
  ["Número (últimos 4 visibles)", "Number (last 4 visible)"],
  ["¿Borrar todo el historial?", "Delete all history?"],
  ["¿Cerrar sesión?", "Sign out?"],
  ["Cerrar sesión", "Sign out"],
  ["Próximamente:", "Coming soon:"],
  ["Sin personalización", "No personalization"],
  ["Satélite", "Satellite"],

  // Problems / sources
  ["Información dispersa", "Scattered information"],
  ["El dato de Airbnb está en una plataforma, la seguridad en otra, la valorización en otra. Nadie los cruza.",
    "Airbnb data lives on one platform, safety on another, appreciation on another. No one cross-references them."],
  ["Fincaraíz y Metrocuadrado muestran precios de oferta. Nadie te dice si ese precio es justo o un 30% inflado.",
    "Fincaraíz and Metrocuadrado show listing prices. No one tells you if that price is fair or 30% inflated."],
  ["Alcaldía MDE", "Medellín City Hall"],
  ["Presupuesto, objetivo (Airbnb, renta larga, renta media) y perfil de riesgo. El mapa se personaliza para ti.",
    "Budget, goal (Airbnb, long-term, mid-term rental) and risk profile. The map is personalized for you."],

  // Liquidity bullets
  ["• Interés de la zona (demanda Airbnb)", "• Area interest (Airbnb demand)"],
  ["• Tiempo de publicación de listings activos", "• Listing duration of active properties"],

  // 404
  ["Página no encontrada", "Page not found"],
  ["Esta ruta no existe en Urbidata.", "This route does not exist in Urbidata."],
  ["Ir al inicio", "Go home"],

  // Common short labels (apply last so they don't break compounds above)
  ["Comparador", "Compare"],
  ["Favoritos", "Favorites"],
  ["Historial", "History"],
  ["Perfil Inversor", "Investor Profile"],
  ["Perfil inversor", "Investor profile"],
  ["Cuenta", "Account"],
  ["Salir", "Log out"],
  ["Invitado", "Guest"],
  ["Guardar cambios", "Save changes"],
  ["Guardar", "Save"],
  ["Cancelar", "Cancel"],
  ["Eliminar", "Delete"],
  ["Editar", "Edit"],
  ["Continuar", "Continue"],
  ["Siguiente", "Next"],
  ["Atrás", "Back"],
  ["Volver", "Back"],
  ["Cerrar", "Close"],
  ["Aceptar", "Accept"],
  ["Confirmar", "Confirm"],
  ["Buscar", "Search"],
  ["Detalles", "Details"],
  ["Seguridad", "Safety"],
  ["Servicios", "Services"],
  ["Ingresos", "Income"],
  ["Gastos", "Expenses"],
  ["Ahorros", "Savings"],
  ["Riesgo", "Risk"],
  ["Bajo", "Low"],
  ["Medio", "Medium"],
  ["Alto", "High"],
  ["Conservador", "Conservative"],
  ["Moderado", "Moderate"],
  ["Agresivo", "Aggressive"],
  ["Estrategia", "Strategy"],
  ["Objetivo", "Goal"],
  ["Presupuesto", "Budget"],
  ["Resultado", "Result"],
  ["Resultados", "Results"],
  ["Mensual", "Monthly"],
  ["Anual", "Annual"],
  ["Mes", "Month"],
  ["Año", "Year"],
  ["Años", "Years"],
  ["años", "years"],
  ["Tiempo estimado", "Estimated time"],
  ["Actividad de Mercado", "Market Activity"],
  ["Oportunidades detectadas", "Opportunities detected"],
  ["Ver en mapa", "View on map"],
  ["Score", "Score"],
  ["Liquidez", "Liquidity"],
  ["Simular inversión aquí", "Simulate investment here"],
  ["Simular", "Simulate"],
  ["Calcular", "Calculate"],
  ["Yield bruto", "Gross yield"],
  ["Yield neto", "Net yield"],
  ["Precio justo", "Fair price"],
  ["Arriendo estimado", "Estimated rent"],
  ["Arriendo", "Rent"],
  ["Compra", "Purchase"],
  ["Venta", "Sale"],
  ["Listings", "Listings"],
  ["activos", "active"],
  ["frescos", "fresh"],
  ["Días promedio en mercado", "Average days on market"],
  ["días", "days"],
  ["meses", "months"],
  ["Ver más", "See more"],
  ["Cargando", "Loading"],
  ["Error", "Error"],
  ["Reintentar", "Retry"],
  ["Sí", "Yes"],
  ["No", "No"],
  ["Idioma", "Language"],

  // ---- Additional coverage (titles, subtitles, labels) ----
  // Landing — Hero
  ["Urbidata cruza precios de mercado, rendimiento Airbnb, seguridad, conectividad y valorización histórica para decirte exactamente dónde y cómo invertir en Medellín.",
    "Urbidata crosses market prices, Airbnb performance, safety, connectivity and historical appreciation to tell you exactly where and how to invest in Medellín."],
  ["Cruzamos +2,400 listings activos, 3,239 puntos de interés urbano, 10 años de datos de valorización y criminalidad por barrio — todo en tiempo real.",
    "We cross-reference +2,400 active listings, 3,239 urban points of interest, 10 years of appreciation and crime data by neighborhood — all in real time."],
  ["Ingresa tu presupuesto y zona objetivo. Urbidata calcula yield neto, proyección de valorización y retorno total a 5 años — comparado contra un CDT bancario.",
    "Enter your budget and target area. Urbidata calculates net yield, appreciation projection and total 5-year return — compared to a bank CDT."],
  ["Ya analizamos +65 barrios del Valle de Aburrá", "We've already analyzed +65 neighborhoods in the Aburrá Valley"],
  ["Accede gratis durante el beta. Sin tarjeta de crédito.", "Free access during the beta. No credit card required."],
  ["Datos con fines informativos. No constituye asesoría financiera.", "For informational purposes only. Not financial advice."],
  ["El mercado inmobiliario en Medellín es opaco.", "The real estate market in Medellín is opaque."],
  ["Comenzar ahora — Es gratis", "Start now — It's free"],
  ["Datos actualizados · Mayo 2026", "Updated data · May 2026"],
  ["¿Estás invirtiendo con datos", "Are you investing with data"],
  ["Construido sobre", "Built on"],
  ["Deja de adivinar.", "Stop guessing."],
  ["Empieza a invertir", "Start investing"],
  ["Medellín crece.", "Medellín grows."],
  ["Más popular", "Most popular"],
  ["Un motor de decisión,", "A decision engine,"],
  ["Ver demo", "View demo"],
  ["Explorar", "Explore"],
  ["Paso", "Step"],

  // Landing & sections
  ["Toma decisiones con datos", "Make decisions with data"],
  ["Hasta ahora.", "Until now."],
  ["con datos reales.", "with real data."],
  ["datos reales", "real data"],
  ["no un portal de listados.", "not a listings portal."],
  ["en segundos.", "in seconds."],
  ["Nosotros mostramos los datos.", "We show the data."],
  ["o con intuición?", "or on intuition?"],
  ["Prueba la calculadora", "Try the calculator"],
  ["Explora el mapa", "Explore the map"],
  ["Ir al mapa", "Go to the map"],
  ["Comenzar gratis", "Start free"],
  ["Cómo funciona Urbidata", "How Urbidata works"],
  ["Cómo funciona", "How it works"],
  ["Para inversores", "For investors"],
  ["Datos que usamos", "Data we use"],
  ["Datos", "Data"],
  ["El problema", "The Problem"],
  ["Tres perfiles, un mapa", "Three profiles, one map"],
  ["Define tu perfil", "Define your profile"],
  ["Editamos tus filtros y recomendaciones del mapa.", "We tune your filters and map recommendations."],
  ["Lo usaremos para filtrar oportunidades en el mapa.", "We'll use it to filter opportunities on the map."],
  ["Precios sin contexto", "Prices without context"],
  ["Un inversor Airbnb necesita datos distintos que uno de arriendo largo. Los portales tratan a todos igual.",
    "An Airbnb investor needs different data than a long-term landlord. Portals treat everyone the same."],
  ["Hasta 12.6% yield anual", "Up to 12.6% annual yield"],
  ["Demanda creciendo 151% anual", "Demand growing 151% annually"],
  ["Mayor yield potencial en zonas emergentes (El Rodeo, Robledo).",
    "Highest yield potential in emerging areas (El Rodeo, Robledo)."],
  ["Zonas consolidadas con yields estables (El Poblado, Laureles).",
    "Consolidated areas with stable yields (El Poblado, Laureles)."],
  ["retorno anual total", "total annual return"],
  ["retorno anual", "annual return"],
  ["vs CDT bancario", "vs bank CDT"],
  ["CDT bancario", "Bank CDT"],
  ["Barrios analizados", "Neighborhoods analyzed"],
  ["Yield promedio", "Average yield"],
  ["📊 propiedades analizadas", "📊 properties analyzed"],
  ["📊 Listings activos", "📊 Active listings"],
  ["🔄 Listings frescos (<30d)", "🔄 Fresh listings (<30d)"],
  ["🕐 Tiempo prom. publicado", "🕐 Avg. listing time"],
  ["🏘️ barrios con datos", "🏘️ neighborhoods with real data"],
  ["• Volumen de propiedades en venta", "• Volume of properties for sale"],
  ["✓ Actualizado", "✓ Updated"],
  ["Token de Mapbox requerido", "Mapbox token required"],
  ["Vista de ciudad", "City view"],
  ["Mueve el panel", "Move the panel"],
  ["Minimizar", "Minimize"],

  // Comparador
  ["Comparador de barrios", "Neighborhood comparator"],
  ["Top 5 barrios por yield", "Top 5 neighborhoods by yield"],
  ["Tendencia de precio · 12 meses", "Price trend · 12 months"],
  ["Mejor zona perfil", "Best zone for profile"],
  ["Listings destacados", "Featured listings"],
  ["Listings arriendo", "Rental listings"],
  ["Listings venta", "For-sale listings"],
  ["Precio m² (venta)", "Price /m² (sale)"],
  ["Precio m² mediana", "Median price /m²"],
  ["Precio m²", "Price /m²"],
  ["Precio", "Price"],
  ["Zona / Barrio", "Zone / Neighborhood"],
  ["Zona", "Zone"],
  ["Barrio", "Neighborhood"],
  ["Comuna", "Comuna"],
  ["Estrato", "Stratum"],
  ["Tipo", "Type"],
  ["Valor", "Value"],
  ["Recupero", "Payback"],
  ["Horizonte", "Horizon"],
  ["Tradicional", "Traditional"],
  ["Mixto", "Mixed"],
  ["Renta corta", "Short-term rental"],
  ["Renta larga", "Long-term rental"],
  ["Renta media", "Mid-term rental"],
  ["Arriendo largo", "Long-term rent"],
  ["Arriendo tradicional", "Traditional rent"],
  ["Arriendo prom.", "Avg. rent"],
  ["Arriendo", "Rent"],
  ["Yield largo plazo", "Long-term yield"],
  ["Corto plazo", "Short-term"],
  ["Mediano plazo", "Mid-term"],
  ["Largo plazo", "Long-term"],
  ["Entrada al mercado", "Market entry"],
  ["Ingreso mensual estable", "Stable monthly income"],
  ["Ingreso/mes", "Income/mo"],
  ["Ingresos netos", "Net income"],
  ["Portafolio diversificado", "Diversified portfolio"],
  ["Premium / 2 unidades", "Premium / 2 units"],
  ["ROI total", "Total ROI"],
  ["BUENA OPORTUNIDAD", "GOOD OPPORTUNITY"],
  ["EXCELENTE", "EXCELLENT"],
  ["MODERADA", "MODERATE"],
  ["NO RECOMENDADA", "NOT RECOMMENDED"],
  ["SOBRE", "ABOVE"],
  ["BAJO", "LOW"],
  ["Activa", "Active"],

  // Floating panel chips
  ["Cerca metro", "Near metro"],
  ["Cerca parque", "Near park"],
  ["Conectividad", "Connectivity"],
  ["Dist. metro", "Metro dist."],
  ["Dist. mall", "Mall dist."],
  ["Dist. parque", "Park dist."],
  ["Precio bajo mercado · 43% oportunidad", "Below-market price · 43% opportunity"],
  ["El Rodeo: 88/100 score", "El Rodeo: 88/100 score"],
  ["Guardar en favoritos", "Save to favorites"],
  ["Quitar de favoritos", "Remove from favorites"],

  // Profile
  ["Perfil de riesgo", "Risk profile"],
  ["Cambiar foto", "Change photo"],
  ["Dejar en blanco para no cambiar", "Leave blank to keep current"],
  ["Elige la paleta visual del mapa.", "Choose the map's visual palette."],
  ["Tarjeta principal", "Primary card"],
  ["Tarjeta", "Card"],
  ["Titular", "Cardholder"],
  ["Nombre / Etiqueta", "Name / Label"],
  ["Hoy", "Today"],
  ["Completa todos los campos.", "Complete all fields."],

  // Opportunities banner / map
  ["MEDELLÍN", "MEDELLÍN"],

  // ---- Floating panel ----
  ["ℹ️ Precio de negociación estimado descontando comisión inmobiliaria (3% venta, 10% arriendo). Dato real disponible próximamente con escrituras SNR.",
    "ℹ️ Estimated negotiation price after brokerage fee (3% sale, 10% rent). Real data coming soon from SNR deed records."],
  ["Haz clic en un barrio del mapa para ver su análisis →", "Click a neighborhood on the map to see its analysis →"],
  ["Comparado con la zona más verde del Valle de Aburrá", "Compared to the greenest area in the Aburrá Valley"],
  ["Sin remates activos ✅", "No active auctions ✅"],
  ["Fuente: avisos judiciales públicos", "Source: public judicial notices"],
  ["No hay listings con estos filtros.", "No listings match these filters."],
  ["No hay listings de", "No listings for"],
  ["Corrección inmobiliaria", "Real-estate correction"],
  ["Precio publicado:", "Listed price:"],
  ["Precio negociación:", "Negotiation price:"],
  ["Arriendo publicado:", "Listed rent:"],
  ["Arriendo neto:", "Net rent:"],
  ["Yield publicado:", "Listed yield:"],
  ["Yield real est.:", "Est. real yield:"],
  ["Índice verde", "Green index"],
  ["Salud financiera", "Financial health"],
  ["Volver al barrio", "Back to neighborhood"],
  ["Volver al mapa", "Back to map"],
  ["Recomendación", "Recommendation"],
  ["Buena oferta", "Good deal"],
  ["Ver →", "View →"],
  ["Cargando…", "Loading…"],
  ["disponibles.", "available."],
  ["resetear", "reset"],
  ["resultado", "result"],
  ["resultados", "results"],
  ["baños", "baths"],
  ["hab", "bd"],

  // ---- Comparador ----
  ["Selecciona hasta 3 barrios para comparar scores, mercado, seguridad y conectividad.",
    "Select up to 3 neighborhoods to compare scores, market, safety and connectivity."],
  ["Mayor score = mejor oportunidad para este perfil de inversión", "Higher score = better opportunity for this investment profile"],
  ["Error al cargar datos del backend. Verifica que la API esté activa.", "Error loading backend data. Verify the API is running."],
  ["Comparativa por dimensión", "Comparison by dimension"],
  ["Añadir barrio", "Add neighborhood"],
  ["Cargando datos...", "Loading data..."],
  ["Tiempo venta est.", "Est. sale time"],
  ["mayor es mejor", "higher is better"],
  ["menor es mejor", "lower is better"],
  ["Barra más larga = mejor rendimiento relativo en cada dimensión", "Longer bar = better relative performance in each dimension"],
  ["Score Arriendo largo", "Long-term Rent Score"],
  ["Score Renta media", "Mid-term rental Score"],
  ["Score Airbnb", "Airbnb Score"],
  ["Score seguridad", "Safety score"],
  ["Score liquidez", "Liquidity score"],
  ["Demanda de zona", "Zone demand"],
  ["Zona turística", "Tourist area"],
  ["Cafés (500m)", "Cafés (500m)"],
  ["Tu perfil", "Your profile"],
  ["TODOS LOS SCORES", "ALL SCORES"],
  ["MERCADO", "MARKET"],
  ["CONECTIVIDAD", "CONNECTIVITY"],
  ["LIQUIDEZ", "LIQUIDITY"],
  ["SEGURIDAD", "SAFETY"],

  // ---- Calculadora ----
  ["Ajusta los parámetros y presiona Calcular para ver los resultados.", "Adjust parameters and press Calculate to see results."],
  ["Calidad de inversión · Mayor score = mejor oportunidad", "Investment quality · Higher score = better opportunity"],
  ["en ingresos netos (5 años) · Retorno total:", "in net income (5 years) · Total return:"],
  ["✓ Tu propiedad supera al CDT en retorno total", "✓ Your property outperforms CDT in total return"],
  ["Retorno total · 5 años", "Total return · 5 years"],
  ["Ingresos netos acum.", "Accum. net income"],
  ["Ver barrios similares", "View similar neighborhoods"],
  ["Compartir simulación", "Share simulation"],
  ["Error al calcular. Intenta de nuevo.", "Calculation error. Try again."],
  ["Calculando...", "Calculating..."],
  ["Resumen", "Summary"],
  ["Año 5", "Year 5"],
  ["Año 3", "Year 3"],
  ["Año 1", "Year 1"],

  // ---- Auth ----
  ["Creando cuenta…", "Creating account…"],
  ["Error al crear la cuenta.", "Error creating account."],
  ["Credenciales inválidas.", "Invalid credentials."],
  ["Entrando…", "Signing in…"],

  // ---- Perfil / configuración ----
  ["PNG o JPG. La imagen se guarda solo en tu dispositivo.", "PNG or JPG. Image stored on your device only."],
  ["🔒 Demo: los datos se guardan localmente. Próximamente integraremos pasarela segura.",
    "🔒 Demo: data saved locally. Secure gateway coming soon."],
  ["El cambio colorea los polígonos de barrios en tiempo real. El fondo del mapa no cambia.",
    "Changes neighborhood polygon colors in real time. Map background unaffected."],
  ["Color de los polígonos según score de inversión. Cambio inmediato.", "Polygon color by investment score. Changes immediately."],
  ["Muestra barrios con oportunidades detectadas directamente en el mapa", "Shows neighborhoods with detected opportunities on the map"],
  ["Fondo cartográfico. Se aplica al volver al mapa.", "Map background. Applied when returning to the map."],
  ["Aún no tienes métodos de pago guardados.", "No payment methods saved yet."],
  ["Sin favoritos aún. Toca el ⭐ en un barrio para guardarlo.", "No favorites yet. Tap ⭐ on a neighborhood to save it."],
  ["Sin actividad reciente.", "No recent activity."],
  ["Alertas de oportunidad", "Opportunity alerts"],
  ["Paleta de barrios", "Neighborhood palette"],
  ["Estilo del mapa", "Map style"],
  ["Agregar método de pago", "Add payment method"],
  ["Pasarela segura", "Secure gateway"],
  ["Limpiar historial", "Clear history"],
  ["Guardar perfil", "Save profile"],
  ["Actualizado", "Updated"],
  ["Quitar", "Remove"],

  // ---- Onboarding / mapa ----
  ["No pudimos guardar tu perfil en el servidor. Puedes continuar normalmente.",
    "Could not save your profile to the server. You can continue normally."],
  ["Mayor yield potencial en zonas emergentes", "Highest yield potential in emerging areas"],
  ["Zonas consolidadas con yields estables", "Consolidated areas with stable yields"],
  ["Zonas emergentes", "Emerging areas"],
  ["Elige tu estrategia.", "Choose your strategy."],

  // ---- Categorías de score (uppercase) ----
  ["MUY BUENO", "VERY GOOD"],
  ["MUY BAJO", "VERY LOW"],
  ["MUY SEGURO", "VERY SAFE"],
  ["MUY VERDE", "VERY GREEN"],
  ["POCO SEGURO", "SOMEWHAT UNSAFE"],
  ["POCO VERDE", "NOT GREEN"],
  ["PELIGROSO", "DANGEROUS"],
  ["EXCELENTE", "EXCELLENT"],
  ["MODERADO", "MODERATE"],
  ["BUENO", "GOOD"],
  ["SEGURO", "SAFE"],
  ["VERDE", "GREEN"],
  ["MUY ALTO", "VERY HIGH"],
  ["ALTA", "HIGH"],
  ["MEDIA", "MEDIUM"],
  ["BAJA", "LOW"],

  // ---- Misc ----
  ["Redimensionar", "Resize"],
  ["Municipio", "Municipality"],

  // ---- Forgot / Reset password ----
  ["¡Contraseña actualizada!", "Password updated!"],
  ["Contraseña actualizada correctamente. Serás redirigido en segundos.", "Password successfully updated. You will be redirected shortly."],
  ["Copia el token para restablecer tu contraseña", "Copy the token to reset your password"],
  ["En producción esto llegaría a tu email. Válido por 1 hora.", "In production this would be sent to your email. Valid for 1 hour."],
  ["La contraseña debe tener mínimo 6 caracteres.", "Password must have at least 6 characters."],
  ["Error. Token inválido o expirado.", "Error. Invalid or expired token."],
  ["Ingresa el token de recuperación.", "Enter the recovery token."],
  ["Ingresa el token y tu nueva contraseña", "Enter the token and your new password"],
  ["Te enviaremos instrucciones para recuperarla", "We'll send you instructions to recover it"],
  ["Ir a restablecer contraseña →", "Go to reset password →"],
  ["Redirigiendo al login…", "Redirecting to login…"],
  ["¿Olvidaste tu contraseña?", "Forgot your password?"],
  ["Token de recuperación (beta)", "Recovery token (beta)"],
  ["Token de recuperación", "Recovery token"],
  ["Token generado", "Token generated"],
  ["Correo registrado", "Registered email"],
  ["Enviando…", "Sending…"],
  ["Enviar instrucciones", "Send instructions"],
  ["Actualizar contraseña", "Update password"],
  ["Solicitar nuevo token", "Request new token"],
  ["Actualizando…", "Updating…"],
  ["Volver al login", "Back to login"],
  ["Pega el token aquí", "Paste the token here"],
  ["Repite la contraseña", "Repeat password"],
  ["Mínimo 6 caracteres", "Minimum 6 characters"],
  ["Ingresa tu correo.", "Enter your email."],
  ["Error. Intenta de nuevo.", "Error. Try again."],

  // ---- Onboarding ----
  ["Airbnb y renta corta, alta rotación", "Airbnb and short-term rental, high turnover"],
  ["1–6 meses: ejecutivos, nómadas digitales y profesionales en movilidad.", "1–6 months: executives, digital nomads and mobile professionals."],
  ["Renta Corta", "Short-term Rental"],

  // ---- Perfil (profile) ----
  ["Personaliza tu cuenta, perfil de inversor y experiencia de mapa.", "Customize your account, investor profile and map experience."],
  ["Error al cargar favoritos. Verifica tu conexión.", "Error loading favorites. Check your connection."],
  ["Error al cargar historial. Verifica tu conexión.", "Error loading history. Check your connection."],
  ["Tus últimas simulaciones y búsquedas (últimas 20).", "Your latest simulations and searches (last 20)."],
  ["Cargando favoritos...", "Loading favorites..."],
  ["Cargando historial...", "Loading history..."],
  ["Comparó barrios", "Compared neighborhoods"],
  ["Guardar método", "Save method"],
  ["✓ Guardado", "✓ Saved"],
  ["Activo", "Active"],

  // ---- Calculadora ----
  ["Resultados basados en datos reales del mercado", "Results based on real market data"],
  ["Comparar barrios", "Compare neighborhoods"],
  ["· 8% costos operativos (vacancia + mantenimiento)", "· 8% operating costs (vacancy + maintenance)"],
  ["· 2.7% predial + adm. + seguros", "· 2.7% property tax + mgmt. + insurance"],
  ["Después de descontar:", "After deducting:"],
  ["Ingreso real mensual:", "Real monthly income:"],
  ["Precio máx", "Max price"],
  ["Área mín", "Min area"],
  ["Año 10", "Year 10"],
  ["neto", "net"],

  // ---- FloatingPanel — city / barrio ----
  ["✅ Alta demanda de renta media. Cafés, coworking y servicios consolidados. Zona con flujo sostenido de ejecutivos y profesionales remotos.",
    "✅ High mid-term rental demand. Cafés, coworking and consolidated services. Area with sustained flow of executives and remote professionals."],
  ["⚡ Demanda de zona moderada. Infraestructura disponible. Potencial creciente para arriendos de 1 a 6 meses.",
    "⚡ Moderate zone demand. Available infrastructure. Growing potential for 1 to 6 month rentals."],
  ["⚠️ Demanda limitada en esta zona. Considera zonas con mayor densidad de servicios para renta media.",
    "⚠️ Limited demand in this area. Consider areas with higher service density for mid-term rentals."],
  ["Arriendos de 1 a 6 meses · Ejecutivos y profesionales en movilidad.", "1 to 6 month rentals · Executives and mobile professionals."],
  ["Próximamente: integraremos datos reales de transacciones de la Superintendencia de Notariado y Registro para mostrar tiempo real de venta por barrio.",
    "Coming soon: we will integrate real transaction data from the Notary and Registry authority to show real sale time by neighborhood."],
  ["Basado en volumen de mercado activo. Liquidez real disponible próximamente con datos de transacciones oficiales.",
    "Based on active market volume. Real liquidity coming soon with official transaction data."],
  ["Este índice mide la actividad del mercado inmobiliario basado en:", "This index measures real estate market activity based on:"],
  ["Proyección 5 años:", "5-year projection:"],
  ["Fuente: DANE IPVN · Ajustado por estrato", "Source: DANE IPVN · Adjusted for stratum"],
  ["📍 Demanda de la zona", "📍 Zone demand"],
  ["💰 Rendimiento estimado", "💰 Estimated yield"],
  ["📊 Precio justo (PBN)", "📊 Fair price (PBN)"],
  ["📈 Valorización histórica", "📈 Historical appreciation"],
  ["🎯 ¿Por qué este score?", "🎯 Why this score?"],
  ["Perfil Renta Media", "Mid-term Rental Profile"],
  ["Arriendo tradicional:", "Traditional rent:"],
  ["Renta media estimada:", "Estimated mid-term rent:"],
  ["Premium vs largo plazo:", "Premium vs long-term:"],
  ["Yield renta media:", "Mid-term rental yield:"],
  ["Yield largo plazo (ref):", "Long-term yield (ref):"],
  ["Yield renta media", "Mid-term rental yield"],
  ["Precio actual:", "Current price:"],
  ["PBN justo:", "Fair PBN:"],
  ["Oportunidad detectada", "Opportunity detected"],
  ["Volver a ciudad", "Back to city"],
  ["Seguridad percibida", "Perceived safety"],
  ["Cafés en 500m", "Cafés within 500m"],
  ["Coworking en 1km", "Coworking within 1km"],
  ["Gimnasios en 1km", "Gyms within 1km"],
  ["Buscar barrio…", "Search neighborhood…"],
  ["Tu perfil:", "Your profile:"],
  ["desde 2015", "since 2015"],
  ["último año", "last year"],
  ["sin datos", "no data"],
  ["Sin datos", "No data"],
  ["ahora", "now"],

  // ---- Auth — recommendation strings ----
  ["🎯 Para tu perfil Airbnb, El Poblado y Laureles tienen la mayor demanda de renta corta estimada. Yield promedio zona: 7.4%",
    "🎯 For your Airbnb profile, El Poblado and Laureles have the highest estimated short-term rental demand. Average zone yield: 7.4%"],
  ["🏠 Para renta larga, Robledo y Aranjuez ofrecen el mejor balance precio/arriendo con baja vacancia.",
    "🏠 For long-term rental, Robledo and Aranjuez offer the best price/rent balance with low vacancy."],
  ["📅 Para renta media (1-6 meses), El Poblado y Laureles lideran en yield renta media y demanda de ejecutivos y profesionales en movilidad.",
    "📅 For mid-term rental (1-6 months), El Poblado and Laureles lead in mid-term rental yield and demand from executives and mobile professionals."],
];

/* Tokens that should never be translated (brand, neighborhood names, etc.) */
const PROTECT = new Set([
  "Urbidata", "Medellín", "Aburrá", "Airbnb", "Belén", "Estadio",
  "Laureles", "Robledo", "Aranjuez", "El Poblado", "El Rodeo",
  "Mapbox", "Fincaraíz", "Metrocuadrado", "PBN", "ADR", "CDT",
  "Google", "PSE", "Nequi",

  // Panel section labels & API category values — always shown in Spanish
  "Seguridad", "Salud financiera", "Índice verde", "Valorización",
  "Actividad de Mercado", "Tiempo estimado", "Listings destacados",
  "Simular inversión aquí",
  "Renta media", "RENTA MEDIA", "Demanda de zona", "Rendimiento estimado",
  // Categoria values from the API (returned as Spanish strings from dbt)
  "MUY SEGURO", "SEGURO", "POCO SEGURO", "PELIGROSO",
  "MUY VERDE", "VERDE", "POCO VERDE",
  "ALTA", "MEDIA", "BAJA", "MUY BAJA",
  "Sin remates activos ✅",
  "Fuente: avisos judiciales públicos",
]);

// Sort once, longest phrases first so substrings don't pre-empt phrases.
const SORTED_PHRASES = [...PHRASES].sort((a, b) => b[0].length - a[0].length);

function translateString(input: string): string {
  if (!input) return input;
  let out = input;
  for (const [es, en] of SORTED_PHRASES) {
    if (PROTECT.has(es)) continue;
    if (out.includes(es)) {
      out = out.split(es).join(en);
    }
  }
  return out;
}

/* ---- DOM walker ---- */
const TRANSLATABLE_ATTRS = ["placeholder", "title", "aria-label", "alt"];

function translateNode(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const el = node as Text;
      const orig = (el as any).__es ?? el.nodeValue ?? "";
      if (!(el as any).__es) (el as any).__es = orig;
      const next = translateString(orig);
      if (next !== el.nodeValue) el.nodeValue = next;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      // Skip script/style
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") {
        node = walker.nextSibling();
        continue;
      }
      for (const a of TRANSLATABLE_ATTRS) {
        if (el.hasAttribute(a)) {
          const key = `__es_${a}`;
          const orig = (el as any)[key] ?? el.getAttribute(a) ?? "";
          if (!(el as any)[key]) (el as any)[key] = orig;
          const next = translateString(orig);
          if (next !== el.getAttribute(a)) el.setAttribute(a, next);
        }
      }
    }
    node = walker.nextNode();
  }
}

function restoreNode(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const el = node as Text & { __es?: string };
      if (el.__es != null && el.nodeValue !== el.__es) el.nodeValue = el.__es;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      for (const a of TRANSLATABLE_ATTRS) {
        const key = `__es_${a}`;
        const orig = (el as any)[key];
        if (orig != null && el.getAttribute(a) !== orig) el.setAttribute(a, orig);
      }
    }
    node = walker.nextNode();
  }
}

/* ---- Context ---- */
type Ctx = { lang: Lang; setLang: (l: Lang) => void; toggle: () => void; t: (s: string) => string };
const LangCtx = createContext<Ctx>({ lang: "es", setLang: () => {}, toggle: () => {}, t: (s) => s });

let observer: MutationObserver | null = null;

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");

  // Load persisted lang on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = (localStorage.getItem(KEY) as Lang | null) ?? "es";
    setLangState(stored);
  }, []);

  // Apply translation when lang changes; observe DOM mutations while in EN.
  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.lang = lang;

    // Stop any previous observer first.
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (lang === "en") {
      translateNode(document.body);
      observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === "childList") {
            m.addedNodes.forEach((n) => translateNode(n));
          } else if (m.type === "characterData") {
            const t = m.target as Text;
            const orig = (t as any).__es ?? t.nodeValue ?? "";
            (t as any).__es = orig;
            const next = translateString(orig);
            if (next !== t.nodeValue) t.nodeValue = next;
          } else if (m.type === "attributes" && m.attributeName) {
            if (TRANSLATABLE_ATTRS.includes(m.attributeName)) {
              translateNode(m.target);
            }
          }
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: TRANSLATABLE_ATTRS,
      });
    } else {
      restoreNode(document.body);
    }

    return () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    };
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem(KEY, l);
  }, []);
  const toggle = useCallback(() => setLang(lang === "es" ? "en" : "es"), [lang, setLang]);
  const t = useCallback((s: string) => (lang === "en" ? translateString(s) : s), [lang]);

  return <LangCtx.Provider value={{ lang, setLang, toggle, t }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return useContext(LangCtx);
}

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, toggle } = useLang();
  return (
    <button
      onClick={toggle}
      title={lang === "es" ? "Switch to English" : "Cambiar a Español"}
      className={
        "inline-flex items-center gap-1 rounded-full border border-border bg-surface/80 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md transition hover:border-primary/60 " +
        className
      }
    >
      <span>🌐</span>
      <span className={lang === "es" ? "text-primary" : "text-muted-foreground"}>ES</span>
      <span className="text-muted-foreground">|</span>
      <span className={lang === "en" ? "text-primary" : "text-muted-foreground"}>EN</span>
    </button>
  );
}
