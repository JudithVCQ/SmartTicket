import { GoogleGenAI, Type } from "@google/genai";
import "dotenv/config";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function categorizeTicketWithGemini(asunto: string, descripcion: string) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY no está configurada");
  }

  const prompt = `Analiza el siguiente ticket de soporte técnico y extrae la categoría y la prioridad.
Asunto: ${asunto}
Descripción: ${descripcion}

Asigna la categoría más adecuada (ej. Facturación, Redes, Software, Hardware, Inventario, Capacitación, etc.).
Asigna la prioridad estricta como una de las siguientes opciones: Crítica, Alta, Media, Baja.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            categoria: {
              type: Type.STRING,
              description: "La categoría del problema.",
            },
            prioridad: {
              type: Type.STRING,
              description: "Prioridad del ticket (Crítica, Alta, Media, Baja).",
              enum: ["Crítica", "Alta", "Media", "Baja"],
            },
          },
          required: ["categoria", "prioridad"],
        },
      },
    });

    if (!response.text) {
      throw new Error("Respuesta vacía de Gemini");
    }

    const data = JSON.parse(response.text);
    return {
      categoria: data.categoria as string,
      prioridad: data.prioridad as string,
    };
  } catch (error) {
    console.error("Error al llamar a Gemini API:", error);
    throw error;
  }
}
