const fs = require('fs');
const path = require('path');

// Traducciones para contextos en español simple
const translations = {
  // Single candle patterns
  'hammer': {
    description: "Cuerpo pequeño arriba con mecha inferior larga, muestra rechazo a precios bajos.",
    typicalPrediction: "reversión alcista",
    commonContext: "en niveles de soporte o después de caídas, indica que el precio no quiere bajar más"
  },
  'hanging-man': {
    description: "Cuerpo pequeño arriba con mecha inferior larga, muestra debilidad después de subidas.",
    typicalPrediction: "reversión bajista", 
    commonContext: "después de subidas o en resistencia, indica que el precio quiere bajar"
  },
  'shooting-star': {
    description: "Cuerpo pequeño abajo con mecha superior larga, muestra rechazo a precios altos.",
    typicalPrediction: "reversión bajista",
    commonContext: "en niveles de resistencia o después de subidas, indica que el precio no quiere subir más"
  },
  'inverted-hammer': {
    description: "Cuerpo pequeño abajo con mecha superior larga, muestra potencial de reversión alcista.",
    typicalPrediction: "reversión alcista",
    commonContext: "después de caídas o en soporte, indica que el precio quiere subir"
  },
  'doji': {
    description: "Cuerpo muy pequeño, indica indecisión en el mercado.",
    typicalPrediction: "indecisión o reversión",
    commonContext: "en niveles clave de soporte/resistencia, muestra incertidumbre del mercado"
  },
  'dragonfly-doji': {
    description: "Doji con mecha inferior larga y sin mecha superior, muestra rechazo a precios bajos.",
    typicalPrediction: "reversión alcista",
    commonContext: "en niveles de soporte, muestra fuerte rechazo a precios más bajos"
  },
  'gravestone-doji': {
    description: "Doji con mecha superior larga y sin mecha inferior, muestra rechazo a precios altos.",
    typicalPrediction: "reversión bajista",
    commonContext: "en niveles de resistencia, muestra fuerte rechazo a precios más altos"
  },
  'long-legged-doji': {
    description: "Doji con mechas largas arriba y abajo, muestra máxima indecisión.",
    typicalPrediction: "indecisión extrema",
    commonContext: "en puntos de inflexión del mercado, muestra máxima incertidumbre"
  },
  'marubozu': {
    description: "Cuerpo grande sin mechas, muestra fuerte dirección.",
    typicalPrediction: "continuación fuerte",
    commonContext: "en tendencias fuertes, muestra convicción en la dirección del precio"
  },
  'spinning-top': {
    description: "Cuerpo pequeño con mechas largas, muestra indecisión.",
    typicalPrediction: "indecisión",
    commonContext: "en mercados laterales, muestra lucha entre compradores y vendedores"
  },

  // Double candle patterns
  'engulfing': {
    description: "Una vela grande 'engulle' completamente a la vela anterior pequeña.",
    typicalPrediction: "reversión (alcista si verde engulle roja, bajista si roja engulle verde)",
    commonContext: "al final de una tendencia, indica cambio fuerte en el momentum"
  },
  'harami': {
    description: "Una vela pequeña está dentro del cuerpo de la vela anterior grande.",
    typicalPrediction: "reversión o pausa",
    commonContext: "después de movimientos fuertes, indica que la tendencia se está agotando"
  },
  'piercing-line': {
    description: "Vela verde abre abajo de vela roja anterior y cierra en su mitad.",
    typicalPrediction: "reversión alcista",
    commonContext: "después de caídas, indica que los compradores están tomando control"
  },
  'dark-cloud-cover': {
    description: "Vela roja abre arriba de vela verde anterior y cierra en su mitad.",
    typicalPrediction: "reversión bajista",
    commonContext: "después de subidas, indica que los vendedores están tomando control"
  },
  'tweezers': {
    description: "Dos velas con altos o bajos similares, forman resistencia o soporte.",
    typicalPrediction: "reversión en el nivel",
    commonContext: "en niveles importantes, muestra que el precio respeta ese nivel"
  },

  // Triple candle patterns
  'morning-star': {
    description: "Roja → Doji → Verde, con gaps, indica fin de caída.",
    typicalPrediction: "reversión alcista",
    commonContext: "después de caídas fuertes, indica que los compradores están entrando"
  },
  'evening-star': {
    description: "Verde → Doji → Roja, con gaps, indica fin de subida.",
    typicalPrediction: "reversión bajista",
    commonContext: "después de subidas fuertes, indica que los vendedores están entrando"
  },
  'three-white-soldiers': {
    description: "Tres velas verdes consecutivas que suben progresivamente.",
    typicalPrediction: "continuación alcista fuerte",
    commonContext: "en tendencias alcistas, muestra fuerza sostenida de compradores"
  },
  'three-black-crows': {
    description: "Tres velas rojas consecutivas que bajan progresivamente.",
    typicalPrediction: "continuación bajista fuerte",
    commonContext: "en tendencias bajistas, muestra fuerza sostenida de vendedores"
  },
  'three-inside': {
    description: "Tres velas donde la del medio está dentro de las otras dos.",
    typicalPrediction: "reversión o consolidación",
    commonContext: "después de movimientos fuertes, indica que el momentum se está agotando"
  },
  'three-outside': {
    description: "Tres velas donde la del medio engulle a las otras dos.",
    typicalPrediction: "reversión fuerte",
    commonContext: "en cambios de tendencia, muestra que una dirección está dominando"
  },
  'rising-falling-three-methods': {
    description: "Patrón de cinco velas que muestra pausa en la tendencia.",
    typicalPrediction: "continuación después de pausa",
    commonContext: "en tendencias fuertes, indica pausa temporal antes de continuar"
  },
  'tasuki-mat-hold': {
    description: "Patrón de cuatro velas que muestra consolidación en tendencia alcista.",
    typicalPrediction: "continuación alcista",
    commonContext: "en tendencias alcistas, indica pausa antes de continuar subiendo"
  },

  // Chart patterns
  'double-top': {
    description: "Dos picos similares con valle entre ellos, patrón de reversión bajista.",
    typicalPrediction: "reversión bajista",
    commonContext: "después de una tendencia alcista, cuando el precio no puede romper resistencia dos veces"
  },
  'double-bottom': {
    description: "Dos valles similares con pico entre ellos, patrón de reversión alcista.",
    typicalPrediction: "reversión alcista",
    commonContext: "después de una tendencia bajista, cuando el precio no puede romper soporte dos veces"
  },
  'head-and-shoulders': {
    description: "Tres picos donde el del medio es más alto, patrón de reversión bajista.",
    typicalPrediction: "reversión bajista",
    commonContext: "al final de tendencias alcistas largas, indica que la subida está terminando"
  },
  'inverse-head-and-shoulders': {
    description: "Tres valles donde el del medio es más bajo, patrón de reversión alcista.",
    typicalPrediction: "reversión alcista",
    commonContext: "al final de tendencias bajistas largas, indica que la caída está terminando"
  },
  'ascending-triangle': {
    description: "Línea de resistencia horizontal con línea de soporte ascendente.",
    typicalPrediction: "ruptura alcista",
    commonContext: "en tendencias alcistas, indica que los compradores están ganando fuerza"
  },
  'descending-triangle': {
    description: "Línea de soporte horizontal con línea de resistencia descendente.",
    typicalPrediction: "ruptura bajista",
    commonContext: "en tendencias bajistas, indica que los vendedores están ganando fuerza"
  },
  'symmetrical-triangle': {
    description: "Líneas de soporte y resistencia que convergen, indica consolidación.",
    typicalPrediction: "ruptura en cualquier dirección",
    commonContext: "en mercados laterales, indica que el precio está comprimiéndose para una ruptura"
  },
  'flag': {
    description: "Pequeña consolidación rectangular después de un movimiento fuerte.",
    typicalPrediction: "continuación de la tendencia",
    commonContext: "después de movimientos fuertes, indica pausa antes de continuar en la misma dirección"
  },
  'pennant': {
    description: "Consolidación triangular después de un movimiento fuerte.",
    typicalPrediction: "continuación de la tendencia",
    commonContext: "después de movimientos fuertes, indica pausa antes de continuar en la misma dirección"
  },
  'rectangle': {
    description: "Rango lateral con soporte y resistencia claros.",
    typicalPrediction: "ruptura en cualquier dirección",
    commonContext: "en mercados laterales, indica que el precio está atrapado entre dos niveles"
  },
  'channel': {
    description: "Dos líneas paralelas que contienen el precio en una tendencia.",
    typicalPrediction: "continuación en la dirección del canal",
    commonContext: "en tendencias claras, indica que el precio respeta los límites del canal"
  },
  'rising-wedge': {
    description: "Dos líneas ascendentes que convergen, patrón de reversión bajista.",
    typicalPrediction: "reversión bajista",
    commonContext: "después de subidas largas, indica que la fuerza alcista se está agotando"
  },
  'falling-wedge': {
    description: "Dos líneas descendentes que convergen, patrón de reversión alcista.",
    typicalPrediction: "reversión alcista",
    commonContext: "después de caídas largas, indica que la fuerza bajista se está agotando"
  },
  'broadening-formation': {
    description: "Dos líneas divergentes que amplían el rango, indica volatilidad creciente.",
    typicalPrediction: "ruptura en cualquier dirección",
    commonContext: "en mercados volátiles, indica que la incertidumbre está aumentando"
  },
  'cup-and-handle': {
    description: "Forma de taza con asa, patrón de continuación alcista.",
    typicalPrediction: "ruptura alcista",
    commonContext: "después de correcciones, indica que el precio está preparándose para subir"
  },
  'diamond': {
    description: "Forma de diamante, patrón de reversión.",
    typicalPrediction: "reversión de tendencia",
    commonContext: "al final de tendencias largas, indica que la dirección está cambiando"
  },
  'triple-top': {
    description: "Tres picos similares, patrón de reversión bajista.",
    typicalPrediction: "reversión bajista",
    commonContext: "después de intentos múltiples de romper resistencia, indica debilidad alcista"
  },
  'triple-bottom': {
    description: "Tres valles similares, patrón de reversión alcista.",
    typicalPrediction: "reversión alcista",
    commonContext: "después de intentos múltiples de romper soporte, indica debilidad bajista"
  }
};

// Función para actualizar un archivo
function updatePatternFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const patternName = path.basename(filePath, '.js');
    
    if (translations[patternName]) {
      const translation = translations[patternName];
      
      // Reemplazar description
      let updatedContent = content.replace(
        /description:\s*"[^"]*"/,
        `description: "${translation.description}"`
      );
      
      // Reemplazar typicalPrediction
      updatedContent = updatedContent.replace(
        /typicalPrediction:\s*"[^"]*"/,
        `typicalPrediction: "${translation.typicalPrediction}"`
      );
      
      // Reemplazar commonContext
      updatedContent = updatedContent.replace(
        /commonContext:\s*"[^"]*"/,
        `commonContext: "${translation.commonContext}"`
      );
      
      fs.writeFileSync(filePath, updatedContent, 'utf8');
      console.log(`✅ Updated: ${filePath}`);
    } else {
      console.log(`⚠️  No translation for: ${patternName}`);
    }
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
  }
}

// Función para procesar directorio
function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);
  
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isFile() && file.endsWith('.js')) {
      updatePatternFile(filePath);
    }
  });
}

// Procesar todos los directorios de patrones
console.log('🔄 Translating pattern contexts to Spanish...');

const patternDirs = [
  'single-candle',
  'double-candle', 
  'triple-candle',
  'chart-patterns'
];

patternDirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (fs.existsSync(dirPath)) {
    console.log(`\n📁 Processing ${dir}:`);
    processDirectory(dirPath);
  }
});

console.log('\n✅ Translation completed!');
