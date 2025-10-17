/**
 * Laboratory Test - Triple Iteration with Shared MongoDB Connection
 * Wrapped in IIFE for async operations and single database connection
 */

const { runBasicSimulation } = require('./testBasic');
const mongoose = require('mongoose');

// IIFE (Immediately Invoked Function Expression) with async
(async () => {
  // Single MongoDB connection for all iterations
  const MONGODB_URI = 'mongodb://localhost:27017/crypto-data-analyser-v2';
  
  try {
    // Connect once to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('🔌 Connected to MongoDB for all iterations');
    
    const TP_MULTIPLIER = [1.0, 1.1, 1.2, 1.5, 2.0, 3.0];    
    const TP_MAX_PERCENT = [0.005, 0.01, 0.015, 0.025, 0.05, 0.1]; 
    const SL_PERCENT = [0.002, 0.005, 0.008, 0.01, 0.02, 0.05];     

    for (let i = 0; i < TP_MULTIPLIER.length; i++) {
      for (let j = 0; j < TP_MAX_PERCENT.length; j++) {
        for (let k = 0; k < SL_PERCENT.length; k++) {
          const tpMultiplier = TP_MULTIPLIER[i];
          const tpMaxPercent = TP_MAX_PERCENT[j];
          const slPercent = SL_PERCENT[k];
          console.log(`[${i},${j},${k}]`);
          
          // Pass the existing mongoose connection
          await runBasicSimulation(false, { 
            tpMultiplier, 
            tpMaxPercent, 
            slPercent,
            mongooseConnection: mongoose
          });
        }
      }
    }
    
    console.log('✅ All iterations completed');
    
  } catch (error) {
    console.error('❌ Error in laboratory test:', error);
  } finally {
    // Close connection only once at the end
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('🔌 Disconnected from MongoDB');
    }
  }
})();

