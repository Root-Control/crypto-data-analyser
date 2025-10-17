/**
 * Laboratory Test - Triple Iteration with Shared MongoDB Connection
 * Wrapped in IIFE for async operations and single database connection
 */

const { runBasicSimulation } = require('./testBasic');
const mongoose = require('mongoose');

// Variables para rastrear los mejores resultados
let bestAccuracy = { value: 0, pnl: 0, config: null, tradesExecuted: 0 };
let bestPnL = { value: 0, accuracy: 0, config: null, tradesExecuted: 0 };

// IIFE (Immediately Invoked Function Expression) with async
(async () => {
  // Single MongoDB connection for all iterations
  const MONGODB_URI = 'mongodb://localhost:27017/crypto-data-analyser-v2';
  //const MONGODB_URI = 'mongodb://localhost:27017/data-analyser';
  
  
  try {
    // Connect once to MongoDB with proper options to keep connection alive
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 0, // Disable socket timeout (keep alive indefinitely)
      connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
      bufferMaxEntries: 0, // Disable mongoose buffering
      bufferCommands: false, // Disable mongoose buffering
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 1, // Maintain a minimum of 1 socket connection
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      serverSelectionRetryDelayMS: 5000, // Wait 5 seconds before retrying
    });
    console.log('🔌 Connected to MongoDB for all iterations');
    
    // Add connection event listeners for debugging
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected unexpectedly!');
    });
    
    mongoose.connection.on('error', (err) => {
      console.log('❌ MongoDB connection error:', err.message);
    });
    
    // OPTIMIZACIÓN DE ALGORITMO - Constantes que afectan la precisión
    const FINAL_SCORE_THRESHOLD =   [0.2, 0.3, 0.4, 0.5];           // Umbral para UP/DOWN vs SIDEWAYS
    const RECENT_CANDLES_MOMENTUM = [5, 10, 15, 20];               // Ventana de momentum
    const FLOW_RECENT_CANDLES =     [2, 3, 5, 7];                     // Ventana de volume flow
    const CLIMAX_RECENT_CANDLES =   [3, 5, 7, 10];                  // Ventana de climax
    
    // Mantener parámetros de trading óptimos encontrados
    const tpMultiplier = 1.2;
    const tpMaxPercent = 0.005;  // Mejor encontrado
    const slPercent = 0.002;     // Mejor encontrado     


/*  
    #ALGORITMO 1
    const tpMultiplier = 1.2;
    const tpMaxPercent =  0.025;
    const slPercent =0.008;    */

    

    for (let i = 0; i < FINAL_SCORE_THRESHOLD.length; i++) {
      for (let j = 0; j < RECENT_CANDLES_MOMENTUM.length; j++) {
        for (let k = 0; k < FLOW_RECENT_CANDLES.length; k++) {
          for (let l = 0; l < CLIMAX_RECENT_CANDLES.length; l++) {
            const finalScoreThreshold = FINAL_SCORE_THRESHOLD[i];
            const recentCandlesMomentum = RECENT_CANDLES_MOMENTUM[j];
            const flowRecentCandles = FLOW_RECENT_CANDLES[k];
            const climaxRecentCandles = CLIMAX_RECENT_CANDLES[l];
            
            try {
              // Capture stdout to get the result
              const originalWrite = process.stdout.write;
              let result = '';
              process.stdout.write = function(chunk) {
                if (typeof chunk === 'string' && chunk.includes('|')) {
                  result = chunk.trim();
                  return true;
                }
                return originalWrite.apply(this, arguments);
              };

              // Pass algorithm constants to optimize precision
              await runBasicSimulation(false, { 
                tpMultiplier, 
                tpMaxPercent, 
                slPercent,
                mongooseConnection: mongoose,
                // Algorithm optimization parameters
                FINAL_SCORE_THRESHOLD: finalScoreThreshold,
                RECENT_CANDLES_MOMENTUM: recentCandlesMomentum,
                FLOW_RECENT_CANDLES: flowRecentCandles,
                CLIMAX_RECENT_CANDLES: climaxRecentCandles,
              });

              // Restore original write function
              process.stdout.write = originalWrite;

              // Parse result
              if (result) {
                const [accuracyStr, pnlStr, tradesStr, wonStr, lostStr] = result.split('|');
                const accuracy = parseFloat(accuracyStr.trim());
                const pnl = parseFloat(pnlStr.trim().replace('$', ''));
                const tradesExecuted = parseInt(tradesStr.trim().replace('t', ''));
                const wonTrades = parseInt(wonStr.trim().replace('+', ''));
                const lostTrades = parseInt(lostStr.trim().replace('-', ''));
                
                // Update best accuracy (solo si hay trades ejecutados)
                if (tradesExecuted > 0 && accuracy > bestAccuracy.value) {
                  bestAccuracy = {
                    value: accuracy,
                    pnl: pnl,
                    config: `[${i},${j},${k},${l}]`,
                    tradesExecuted: tradesExecuted,
                    wonTrades: wonTrades,
                    lostTrades: lostTrades
                  };
                }
                
                // Update best P&L (solo si hay trades ejecutados)
                if (tradesExecuted > 0 && pnl > bestPnL.value) {
                  bestPnL = {
                    value: pnl,
                    accuracy: accuracy,
                    config: `[${i},${j},${k},${l}]`,
                    tradesExecuted: tradesExecuted,
                    wonTrades: wonTrades,
                    lostTrades: lostTrades
                  };
                }
                
                // Colores para trades ganados (verde) y perdidos (rojo)
                const green = '\x1b[32m'; // Verde
                const red = '\x1b[31m';   // Rojo
                const reset = '\x1b[0m';  // Reset color
                
                // Mostrar resultado con información completa
                const groupInfo = `[${i},${j},${k},${l}]`;
                const wonDisplay = wonTrades > 0 ? `${green}+${wonTrades}${reset}` : '+0';
                const lostDisplay = lostTrades > 0 ? `${red}-${lostTrades}${reset}` : '-0';
                
                console.log(`${groupInfo} | ${accuracy.toFixed(2)} | $${pnl.toFixed(2)} | ${tradesExecuted}t | ${wonDisplay} | ${lostDisplay}`);
              }
            } catch (error) {
              // Continue with next iteration instead of stopping
            }
            
            // Cooldown of 1 second between iterations to allow MongoDB to process
          }
        }
      }
    }
    
    console.log('✅ All iterations completed');
    
    // Report final results
    const green = '\x1b[32m';
    const red = '\x1b[31m';
    const reset = '\x1b[0m';
    
    console.log('\n🏆 MEJOR PRECISIÓN:');
    console.log(`Configuración: ${bestAccuracy.config}`);
    console.log(`Precisión: ${bestAccuracy.value.toFixed(2)}%`);
    console.log(`P&L: $${bestAccuracy.pnl.toFixed(2)}`);
    console.log(`Trades ejecutados: ${bestAccuracy.tradesExecuted}`);
    console.log(`Trades ganados: ${green}${bestAccuracy.wonTrades}${reset}`);
    console.log(`Trades perdidos: ${red}${bestAccuracy.lostTrades}${reset}`);
    
    console.log('\n💰 MEJOR P&L:');
    console.log(`Configuración: ${bestPnL.config}`);
    console.log(`P&L: $${bestPnL.value.toFixed(2)}`);
    console.log(`Precisión: ${bestPnL.accuracy.toFixed(2)}%`);
    console.log(`Trades ejecutados: ${bestPnL.tradesExecuted}`);
    console.log(`Trades ganados: ${green}${bestPnL.wonTrades}${reset}`);
    console.log(`Trades perdidos: ${red}${bestPnL.lostTrades}${reset}`);
    
  } catch (error) {
    console.error('❌ Error in laboratory test:', error);
  } finally {
    // Close connection only once at the end with proper delay
    if (mongoose.connection.readyState === 1) {
      // Wait longer for all pending operations to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      await mongoose.disconnect();
      console.log('🔌 Disconnected from MongoDB');
    }
  }
})();

