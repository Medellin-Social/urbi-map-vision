import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { API_ENDPOINTS } from "@/config/api";
import { getToken } from "@/lib/apiClient";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";

export const Route = createFileRoute("/agentes/registro")({
  component: RegistroAgenteRoot,
  head: () => ({
    meta: [
      { title: "Registro de Agente · Medellín Social" },
      { name: "description", content: "Únete como agente verificado en Medellín Social" },
    ],
  }),
});

function RegistroAgenteRoot() {
  return (
    <ComunidadLayout>
      <RegistroAgentePage />
    </ComunidadLayout>
  );
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const K = {
  paper:   "#FAF7F2",
  surface: "#F5F0E8",
  line:    "#E9E4D8",
  ink:     "#14201D",
  muted:   "#62736D",
  teal:    "#1D9E75",
  coral:   "#D85A30",
  serif:   "'Fraunces', Georgia, serif" as const,
};

// ── Types ──────────────────────────────────────────────────────────────────────

type FormData = {
  // S1
  nombre_completo: string;
  cedula_numero: string;
  fecha_nacimiento: string;
  // S2
  es_independiente: boolean;
  inmobiliaria_nombre: string;
  inmobiliaria_nit: string;
  // S3
  anos_experiencia: string;
  transacciones_cerradas: string;
  especialidad: string[];
  tipo_inmueble: string[];
  precio_rango_min: string;
  precio_rango_max: string;
  zonas_opera: string[];
  // S4
  telefono: string;
  email: string;
  whatsapp: string;
  linkedin: string;
  instagram: string;
  sitio_web: string;
  // S5
  ref1_nombre: string; ref1_telefono: string; ref1_tipo: string;
  ref2_nombre: string; ref2_telefono: string; ref2_tipo: string;
  ref3_nombre: string; ref3_telefono: string; ref3_tipo: string;
  // S6
  acepta_terminos: boolean;
  acepta_politica: boolean;
  acepta_suspension: boolean;
};

type FileData = {
  cedula_foto_frente: File | null;
  cedula_foto_reverso: File | null;
  foto_perfil: File | null;
  rut_documento: File | null;
  tarjeta_profesional: File | null;
};

const INITIAL_FORM: FormData = {
  nombre_completo: "", cedula_numero: "", fecha_nacimiento: "",
  es_independiente: true, inmobiliaria_nombre: "", inmobiliaria_nit: "",
  anos_experiencia: "", transacciones_cerradas: "",
  especialidad: [], tipo_inmueble: [], precio_rango_min: "", precio_rango_max: "",
  zonas_opera: [],
  telefono: "", email: "", whatsapp: "", linkedin: "", instagram: "", sitio_web: "",
  ref1_nombre: "", ref1_telefono: "", ref1_tipo: "",
  ref2_nombre: "", ref2_telefono: "", ref2_tipo: "",
  ref3_nombre: "", ref3_telefono: "", ref3_tipo: "",
  acepta_terminos: false, acepta_politica: false, acepta_suspension: false,
};

const STEPS = [
  "Identidad",
  "Legal",
  "Experiencia",
  "Contacto",
  "Referencias",
  "Términos",
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function toggleArr(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label style={{ fontSize: 13, color: K.muted, fontWeight: 500 }}>
        {label}{required && <span style={{ color: K.coral }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = `w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75] transition-colors`;
const inputStyle = { borderColor: K.line, background: "#fff", color: K.ink };

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputCls} style={inputStyle} {...props} />;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={inputCls} style={inputStyle} {...props}>
      {children}
    </select>
  );
}

function FileUpload({
  label, accept, required, file, onChange,
}: {
  label: string; accept?: string; required?: boolean;
  file: File | null; onChange: (f: File | null) => void;
}) {
  return (
    <Field label={label} required={required}>
      <label
        className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors hover:border-[#1D9E75]/60"
        style={{ borderColor: file ? K.teal : K.line, background: file ? "#F0FBF6" : "#fff", minHeight: 80, padding: 16 }}
      >
        <input type="file" accept={accept} className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
        {file ? (
          <span style={{ color: K.teal, fontSize: 13, fontWeight: 600, textAlign: "center" }}>
            ✓ {file.name}
          </span>
        ) : (
          <>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={K.muted} strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span style={{ color: K.muted, fontSize: 12, textAlign: "center" }}>
              Haz clic para subir{accept?.includes("pdf") ? " (PDF, JPG, PNG · máx 5MB)" : " (JPG, PNG · máx 5MB)"}
            </span>
          </>
        )}
      </label>
    </Field>
  );
}

function CheckboxGroup({
  label, options, values, onChange,
}: {
  label: string; options: { value: string; label: string }[];
  values: string[]; onChange: (vals: string[]) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(toggleArr(values, opt.value))}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-all"
            style={{
              borderColor: values.includes(opt.value) ? K.teal : K.line,
              background: values.includes(opt.value) ? K.teal : "#fff",
              color: values.includes(opt.value) ? "#fff" : K.muted,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

// ── Step components ────────────────────────────────────────────────────────────

function Step1({
  data, files, setData, setFiles,
}: {
  data: FormData; files: FileData;
  setData: (d: Partial<FormData>) => void;
  setFiles: (f: Partial<FileData>) => void;
}) {
  return (
    <div className="grid gap-4">
      <Field label="Nombre completo" required>
        <Input value={data.nombre_completo} onChange={(e) => setData({ nombre_completo: e.target.value })} placeholder="Como aparece en tu cédula" />
      </Field>
      <Field label="Número de cédula" required>
        <Input value={data.cedula_numero} onChange={(e) => setData({ cedula_numero: e.target.value })} placeholder="123456789" />
      </Field>
      <Field label="Fecha de nacimiento">
        <Input type="date" value={data.fecha_nacimiento} onChange={(e) => setData({ fecha_nacimiento: e.target.value })} />
      </Field>
      <FileUpload label="Foto de cédula — frente" accept="image/*,.pdf" required file={files.cedula_foto_frente} onChange={(f) => setFiles({ cedula_foto_frente: f })} />
      <FileUpload label="Foto de cédula — reverso" accept="image/*,.pdf" required file={files.cedula_foto_reverso} onChange={(f) => setFiles({ cedula_foto_reverso: f })} />
      <FileUpload label="Foto de perfil profesional" accept="image/*" required file={files.foto_perfil} onChange={(f) => setFiles({ foto_perfil: f })} />
    </div>
  );
}

function Step2({ data, files, setData, setFiles }: {
  data: FormData; files: FileData;
  setData: (d: Partial<FormData>) => void;
  setFiles: (f: Partial<FileData>) => void;
}) {
  return (
    <div className="grid gap-4">
      <FileUpload label="RUT" accept=".pdf,image/*" required file={files.rut_documento} onChange={(f) => setFiles({ rut_documento: f })} />
      <FileUpload label="Tarjeta profesional de lonja (opcional)" accept=".pdf,image/*" file={files.tarjeta_profesional} onChange={(f) => setFiles({ tarjeta_profesional: f })} />
      <Field label="¿Pertenece a una inmobiliaria?">
        <div className="flex gap-3">
          {[
            { label: "Soy independiente", val: true },
            { label: "Pertenezco a una inmobiliaria", val: false },
          ].map((opt) => (
            <button
              key={String(opt.val)}
              type="button"
              onClick={() => setData({ es_independiente: opt.val })}
              className="flex-1 rounded-lg border py-2.5 text-sm font-medium transition-all"
              style={{
                borderColor: data.es_independiente === opt.val ? K.teal : K.line,
                background: data.es_independiente === opt.val ? K.teal : "#fff",
                color: data.es_independiente === opt.val ? "#fff" : K.muted,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Field>
      {!data.es_independiente && (
        <>
          <Field label="Nombre de la inmobiliaria" required>
            <Input value={data.inmobiliaria_nombre} onChange={(e) => setData({ inmobiliaria_nombre: e.target.value })} placeholder="Nombre completo" />
          </Field>
          <Field label="NIT de la inmobiliaria" required>
            <Input value={data.inmobiliaria_nit} onChange={(e) => setData({ inmobiliaria_nit: e.target.value })} placeholder="900123456-1" />
          </Field>
        </>
      )}
    </div>
  );
}

const EXP_OPTIONS = [
  { value: "1", label: "1-2 años" },
  { value: "3", label: "3-5 años" },
  { value: "5", label: "5-10 años" },
  { value: "10", label: "+10 años" },
];
const TXN_OPTIONS = [
  { value: "5", label: "1-10" },
  { value: "25", label: "10-50" },
  { value: "75", label: "50-100" },
  { value: "100", label: "+100" },
];

function Step3({ data, setData }: { data: FormData; setData: (d: Partial<FormData>) => void }) {
  return (
    <div className="grid gap-4">
      <Field label="Años de experiencia" required>
        <Select value={data.anos_experiencia} onChange={(e) => setData({ anos_experiencia: e.target.value })}>
          <option value="">Selecciona</option>
          {EXP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      <Field label="Transacciones cerradas" required>
        <Select value={data.transacciones_cerradas} onChange={(e) => setData({ transacciones_cerradas: e.target.value })}>
          <option value="">Selecciona</option>
          {TXN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      <CheckboxGroup
        label="Especialidad *"
        options={[
          { value: "venta", label: "Venta" },
          { value: "arriendo", label: "Arriendo" },
        ]}
        values={data.especialidad}
        onChange={(v) => setData({ especialidad: v })}
      />
      <CheckboxGroup
        label="Tipo de inmueble *"
        options={[
          { value: "residencial", label: "Residencial" },
          { value: "comercial", label: "Comercial" },
        ]}
        values={data.tipo_inmueble}
        onChange={(v) => setData({ tipo_inmueble: v })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Precio mínimo (COP)">
          <Input
            type="number" placeholder="200.000.000"
            value={data.precio_rango_min}
            onChange={(e) => setData({ precio_rango_min: e.target.value })}
          />
        </Field>
        <Field label="Precio máximo (COP)">
          <Input
            type="number" placeholder="2.000.000.000"
            value={data.precio_rango_max}
            onChange={(e) => setData({ precio_rango_max: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Zonas donde opera (comunas/municipios)">
        <ZonasSelector values={data.zonas_opera} onChange={(v) => setData({ zonas_opera: v })} />
      </Field>
    </div>
  );
}

const ZONAS_MEDELLIN = [
  "Poblado", "Laureles", "Envigado", "Sabaneta", "Bello", "Itagüí",
  "La Candelaria", "Estadio", "Belén", "Robledo", "Castilla",
  "Aranjuez", "Manrique", "Santa Cruz", "Popular", "Villa Hermosa",
  "Buenos Aires", "Guayabal", "La América", "San Javier",
  "Copacabana", "Girardota", "Barbosa", "Caldas", "La Estrella",
];

function ZonasSelector({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border p-3" style={{ borderColor: K.line, background: "#fff" }}>
      {ZONAS_MEDELLIN.map((zona) => (
        <button
          key={zona}
          type="button"
          onClick={() => onChange(toggleArr(values, zona))}
          className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all"
          style={{
            borderColor: values.includes(zona) ? K.teal : K.line,
            background: values.includes(zona) ? K.teal : "transparent",
            color: values.includes(zona) ? "#fff" : K.muted,
          }}
        >
          {zona}
        </button>
      ))}
    </div>
  );
}

function Step4({ data, setData }: { data: FormData; setData: (d: Partial<FormData>) => void }) {
  return (
    <div className="grid gap-4">
      <Field label="Teléfono celular" required>
        <Input
          type="tel" placeholder="+57 300 000 0000"
          value={data.telefono} onChange={(e) => setData({ telefono: e.target.value })}
        />
        <span style={{ fontSize: 11, color: K.muted }}>
          La verificación por SMS estará disponible próximamente
        </span>
      </Field>
      <Field label="Email profesional" required>
        <Input
          type="email" placeholder="nombre@inmobiliaria.com"
          value={data.email} onChange={(e) => setData({ email: e.target.value })}
        />
      </Field>
      <Field label="WhatsApp (opcional)">
        <Input
          type="tel" placeholder="+57 300 000 0000"
          value={data.whatsapp} onChange={(e) => setData({ whatsapp: e.target.value })}
        />
      </Field>
      <Field label="LinkedIn (opcional)">
        <Input
          placeholder="https://linkedin.com/in/tu-perfil"
          value={data.linkedin} onChange={(e) => setData({ linkedin: e.target.value })}
        />
      </Field>
      <Field label="Instagram (opcional)">
        <Input
          placeholder="@tu_usuario"
          value={data.instagram} onChange={(e) => setData({ instagram: e.target.value })}
        />
      </Field>
      <Field label="Sitio web (opcional)">
        <Input
          placeholder="https://tu-sitio.com"
          value={data.sitio_web} onChange={(e) => setData({ sitio_web: e.target.value })}
        />
      </Field>
    </div>
  );
}

const REF_TIPOS = ["Venta", "Arriendo", "Administración de inmueble"];

function RefBlock({
  num, nombre, telefono, tipo,
  onNombre, onTelefono, onTipo,
}: {
  num: number;
  nombre: string; telefono: string; tipo: string;
  onNombre: (v: string) => void;
  onTelefono: (v: string) => void;
  onTipo: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border p-4 grid gap-3" style={{ borderColor: K.line, background: K.surface }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: K.ink }}>Referencia {num}</p>
      <Field label="Nombre completo">
        <Input value={nombre} onChange={(e) => onNombre(e.target.value)} placeholder="Nombre del cliente" />
      </Field>
      <Field label="Teléfono">
        <Input type="tel" value={telefono} onChange={(e) => onTelefono(e.target.value)} placeholder="+57 300 000 0000" />
      </Field>
      <Field label="Tipo de transacción">
        <Select value={tipo} onChange={(e) => onTipo(e.target.value)}>
          <option value="">Selecciona</option>
          {REF_TIPOS.map((t) => <option key={t}>{t}</option>)}
        </Select>
      </Field>
    </div>
  );
}

function Step5({ data, setData }: { data: FormData; setData: (d: Partial<FormData>) => void }) {
  return (
    <div className="grid gap-4">
      <p style={{ fontSize: 13, color: K.muted }}>
        Proporciona al menos una referencia de clientes anteriores.
      </p>
      <RefBlock num={1}
        nombre={data.ref1_nombre} telefono={data.ref1_telefono} tipo={data.ref1_tipo}
        onNombre={(v) => setData({ ref1_nombre: v })}
        onTelefono={(v) => setData({ ref1_telefono: v })}
        onTipo={(v) => setData({ ref1_tipo: v })}
      />
      <RefBlock num={2}
        nombre={data.ref2_nombre} telefono={data.ref2_telefono} tipo={data.ref2_tipo}
        onNombre={(v) => setData({ ref2_nombre: v })}
        onTelefono={(v) => setData({ ref2_telefono: v })}
        onTipo={(v) => setData({ ref2_tipo: v })}
      />
      <RefBlock num={3}
        nombre={data.ref3_nombre} telefono={data.ref3_telefono} tipo={data.ref3_tipo}
        onNombre={(v) => setData({ ref3_nombre: v })}
        onTelefono={(v) => setData({ ref3_telefono: v })}
        onTipo={(v) => setData({ ref3_tipo: v })}
      />
    </div>
  );
}

function CheckItem({
  checked, onChange, children,
}: {
  checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div
        onClick={() => onChange(!checked)}
        className="mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all cursor-pointer"
        style={{ borderColor: checked ? K.teal : K.line, background: checked ? K.teal : "#fff" }}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span style={{ fontSize: 14, color: K.ink, lineHeight: 1.5 }}>{children}</span>
    </label>
  );
}

function Step6({ data, setData }: { data: FormData; setData: (d: Partial<FormData>) => void }) {
  return (
    <div className="grid gap-5">
      <CheckItem checked={data.acepta_terminos} onChange={(v) => setData({ acepta_terminos: v })}>
        Acepto los <a href="/terminos" style={{ color: K.teal, textDecoration: "underline" }}>términos y condiciones</a> de Medellín Social
      </CheckItem>
      <CheckItem checked={data.acepta_politica} onChange={(v) => setData({ acepta_politica: v })}>
        Acepto la política de publicación de listings
      </CheckItem>
      <CheckItem checked={data.acepta_suspension} onChange={(v) => setData({ acepta_suspension: v })}>
        Entiendo que listings falsos resultan en suspensión inmediata de mi cuenta
      </CheckItem>
      <div className="rounded-lg p-4" style={{ background: K.surface, border: `1px solid ${K.line}` }}>
        <p style={{ fontSize: 13, color: K.muted, lineHeight: 1.6 }}>
          Al enviar confirmo que toda la información proporcionada es verídica y que los documentos
          adjuntos me pertenecen. Medellín Social verificará manualmente mis datos antes de activar mi cuenta.
        </p>
      </div>
    </div>
  );
}

// ── Validation ─────────────────────────────────────────────────────────────────

function validateStep(step: number, data: FormData, files: FileData): string | null {
  if (step === 0) {
    if (!data.nombre_completo.trim()) return "Ingresa tu nombre completo";
    if (!data.cedula_numero.trim()) return "Ingresa tu número de cédula";
    if (!files.cedula_foto_frente) return "Sube la foto del frente de tu cédula";
    if (!files.cedula_foto_reverso) return "Sube la foto del reverso de tu cédula";
    if (!files.foto_perfil) return "Sube tu foto de perfil";
  }
  if (step === 1) {
    if (!files.rut_documento) return "Sube tu RUT";
    if (!data.es_independiente && !data.inmobiliaria_nombre.trim()) return "Ingresa el nombre de tu inmobiliaria";
    if (!data.es_independiente && !data.inmobiliaria_nit.trim()) return "Ingresa el NIT de tu inmobiliaria";
  }
  if (step === 2) {
    if (!data.anos_experiencia) return "Selecciona tus años de experiencia";
    if (!data.transacciones_cerradas) return "Selecciona el número de transacciones";
    if (data.especialidad.length === 0) return "Selecciona al menos una especialidad";
    if (data.tipo_inmueble.length === 0) return "Selecciona al menos un tipo de inmueble";
  }
  if (step === 3) {
    if (!data.telefono.trim()) return "Ingresa tu teléfono";
    if (!data.email.trim()) return "Ingresa tu email profesional";
  }
  if (step === 5) {
    if (!data.acepta_terminos) return "Debes aceptar los términos y condiciones";
    if (!data.acepta_politica) return "Debes aceptar la política de publicación";
    if (!data.acepta_suspension) return "Debes aceptar la política de suspensión";
  }
  return null;
}

// ── Main page ──────────────────────────────────────────────────────────────────

function RegistroAgentePage() {
  const [step, setStep] = useState(0);
  const [form, setFormRaw] = useState<FormData>(INITIAL_FORM);
  const [files, setFilesRaw] = useState<FileData>({
    cedula_foto_frente: null, cedula_foto_reverso: null,
    foto_perfil: null, rut_documento: null, tarjeta_profesional: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const setData = useCallback((d: Partial<FormData>) => setFormRaw((p) => ({ ...p, ...d })), []);
  const setFiles = useCallback((f: Partial<FileData>) => setFilesRaw((p) => ({ ...p, ...f })), []);

  const next = () => {
    const err = validateStep(step, form, files);
    if (err) { setError(err); return; }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prev = () => { setError(null); setStep((s) => Math.max(s - 1, 0)); };

  const submit = async () => {
    const err = validateStep(step, form, files);
    if (err) { setError(err); return; }

    setLoading(true);
    setError(null);

    try {
      const fd = new FormData();
      // Text fields
      fd.append("nombre_completo", form.nombre_completo);
      fd.append("cedula_numero", form.cedula_numero);
      if (form.fecha_nacimiento) fd.append("fecha_nacimiento", form.fecha_nacimiento);
      fd.append("es_independiente", String(form.es_independiente));
      if (form.inmobiliaria_nombre) fd.append("inmobiliaria_nombre", form.inmobiliaria_nombre);
      if (form.inmobiliaria_nit) fd.append("inmobiliaria_nit", form.inmobiliaria_nit);
      if (form.anos_experiencia) fd.append("anos_experiencia", form.anos_experiencia);
      if (form.transacciones_cerradas) fd.append("transacciones_cerradas", form.transacciones_cerradas);
      fd.append("especialidad", JSON.stringify(form.especialidad));
      fd.append("tipo_inmueble", JSON.stringify(form.tipo_inmueble));
      if (form.precio_rango_min) fd.append("precio_rango_min", form.precio_rango_min);
      if (form.precio_rango_max) fd.append("precio_rango_max", form.precio_rango_max);
      if (form.zonas_opera.length) fd.append("zonas_opera", JSON.stringify(form.zonas_opera));
      fd.append("telefono", form.telefono);
      fd.append("email", form.email);
      if (form.whatsapp) fd.append("whatsapp", form.whatsapp);
      if (form.linkedin) fd.append("linkedin", form.linkedin);
      if (form.instagram) fd.append("instagram", form.instagram);
      if (form.sitio_web) fd.append("sitio_web", form.sitio_web);
      if (form.ref1_nombre) fd.append("referencia_1_nombre", form.ref1_nombre);
      if (form.ref1_telefono) fd.append("referencia_1_telefono", form.ref1_telefono);
      if (form.ref1_tipo) fd.append("referencia_1_tipo", form.ref1_tipo);
      if (form.ref2_nombre) fd.append("referencia_2_nombre", form.ref2_nombre);
      if (form.ref2_telefono) fd.append("referencia_2_telefono", form.ref2_telefono);
      if (form.ref2_tipo) fd.append("referencia_2_tipo", form.ref2_tipo);
      if (form.ref3_nombre) fd.append("referencia_3_nombre", form.ref3_nombre);
      if (form.ref3_telefono) fd.append("referencia_3_telefono", form.ref3_telefono);
      if (form.ref3_tipo) fd.append("referencia_3_tipo", form.ref3_tipo);
      fd.append("acepta_terminos", String(form.acepta_terminos));
      fd.append("acepta_politica", String(form.acepta_politica));
      fd.append("acepta_suspension", String(form.acepta_suspension));

      // Files
      if (files.cedula_foto_frente) fd.append("cedula_foto_frente", files.cedula_foto_frente);
      if (files.cedula_foto_reverso) fd.append("cedula_foto_reverso", files.cedula_foto_reverso);
      if (files.foto_perfil) fd.append("foto_perfil", files.foto_perfil);
      if (files.rut_documento) fd.append("rut_documento", files.rut_documento);
      if (files.tarjeta_profesional) fd.append("tarjeta_profesional", files.tarjeta_profesional);

      const headers: Record<string, string> = {};
      const token = getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(API_ENDPOINTS.agentesRegistro, {
        method: "POST",
        headers,
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Error ${res.status}`);
      }

      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  if (done) return <SuccessScreen />;

  const stepProps = { data: form, files, setData, setFiles };

  return (
    <div style={{ background: K.paper, minHeight: "100vh", padding: "40px 0" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 16px" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: K.serif, fontSize: 28, color: K.ink, marginBottom: 6 }}>
            Registro de Agente
          </h1>
          <p style={{ fontSize: 14, color: K.muted }}>
            Únete como agente verificado en Medellín Social · Medellín, Colombia
          </p>
        </div>

        {/* Stepper */}
        <Stepper current={step} steps={STEPS} />

        {/* Form card */}
        <div
          className="rounded-xl shadow-sm"
          style={{ background: "#fff", border: `1px solid ${K.line}`, padding: "28px 24px", marginTop: 24 }}
        >
          <h2 style={{ fontFamily: K.serif, fontSize: 20, color: K.ink, marginBottom: 20 }}>
            {STEPS[step]}
          </h2>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
            >
              {step === 0 && <Step1 {...stepProps} />}
              {step === 1 && <Step2 {...stepProps} />}
              {step === 2 && <Step3 data={form} setData={setData} />}
              {step === 3 && <Step4 data={form} setData={setData} />}
              {step === 4 && <Step5 data={form} setData={setData} />}
              {step === 5 && <Step6 data={form} setData={setData} />}
            </motion.div>
          </AnimatePresence>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-lg px-4 py-3 text-sm"
              style={{ background: "#FAECE7", color: K.coral, border: `1px solid ${K.coral}30` }}
            >
              {error}
            </motion.div>
          )}

          {/* Navigation */}
          <div className="flex justify-between items-center" style={{ marginTop: 28 }}>
            <button
              type="button"
              onClick={prev}
              disabled={step === 0}
              className="rounded-lg border px-5 py-2.5 text-sm font-medium transition-all disabled:opacity-30"
              style={{ borderColor: K.line, color: K.muted }}
            >
              ← Anterior
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-all"
                style={{ background: K.teal }}
              >
                Siguiente →
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={loading}
                className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-60"
                style={{ background: K.teal }}
              >
                {loading ? "Enviando…" : "Enviar solicitud"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stepper ────────────────────────────────────────────────────────────────────

function Stepper({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
              style={{
                background: i < current ? K.teal : i === current ? K.teal : K.line,
                color: i <= current ? "#fff" : K.muted,
              }}
            >
              {i < current ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 7l3 3 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span
              className="hidden sm:block text-center"
              style={{ fontSize: 10, color: i === current ? K.teal : K.muted, fontWeight: i === current ? 600 : 400, width: 64 }}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className="flex-1 h-0.5 mb-5"
              style={{ background: i < current ? K.teal : K.line }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Success screen ─────────────────────────────────────────────────────────────

function SuccessScreen() {
  return (
    <div style={{ background: K.paper, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="text-center rounded-2xl shadow-sm"
        style={{ background: "#fff", border: `1px solid ${K.line}`, padding: "48px 40px", maxWidth: 480 }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: "#F0FBF6" }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path d="M6 16l7 7 13-13" stroke={K.teal} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 style={{ fontFamily: K.serif, fontSize: 24, color: K.ink, marginBottom: 12 }}>
          Solicitud enviada
        </h2>
        <p style={{ fontSize: 15, color: K.muted, lineHeight: 1.6, marginBottom: 24 }}>
          Revisaremos tu información en las próximas <strong>24-48 horas</strong>.
          Te notificaremos por email cuando tu cuenta esté activa.
        </p>
        <a
          href="/real-estate"
          className="inline-block rounded-lg px-6 py-2.5 text-sm font-semibold text-white"
          style={{ background: K.teal }}
        >
          Explorar propiedades
        </a>
      </motion.div>
    </div>
  );
}
