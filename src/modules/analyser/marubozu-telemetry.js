/**
 * Marubozu Telemetry System
 * 
 * Purpose: Track metrics and performance of Marubozu analysis
 * Features:
 * - Decision tracking (FOLLOW/CAUTION/NO_FOLLOW)
 * - Score distribution
 * - RR ratios
 * - Follow-through success
 * - Liquidity usage patterns
 * - Invalidation tracking
 */

class MarubozuTelemetry {
  constructor() {
    this.reset();
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      totalAnalyses: 0,
      followCount: 0,
      cautionCount: 0,
      noFollowCount: 0,
      invalidationCount: 0,
      avgScore: 0,
      avgRR: 0,
      followThroughSuccess: 0,
      liquidityUsage: {
        swing: 0,
        roundFigure: 0,
        vahVal: 0,
        or: 0,
        atr: 0
      },
      scoreDistribution: {
        '0-2': 0,
        '2-4': 0,
        '4-6': 0,
        '6-8': 0,
        '8-10': 0
      },
      rrDistribution: {
        '1.0-1.5': 0,
        '1.5-2.0': 0,
        '2.0-3.0': 0,
        '3.0+': 0
      },
      decisionHistory: [],
      recentAnalyses: []
    };
  }

  /**
   * Record an analysis result
   * @param {Object} analysisResult - Result from analyzeMarubozu
   * @param {Object} context - Additional context (optional)
   */
  record(analysisResult, context = {}) {
    const { score, targets, liquidity, isValid } = analysisResult;
    
    this.metrics.totalAnalyses++;
    
    // Track decisions
    switch (score.decision) {
      case 'FOLLOW':
        this.metrics.followCount++;
        break;
      case 'CAUTION':
        this.metrics.cautionCount++;
        break;
      case 'NO_FOLLOW':
        this.metrics.noFollowCount++;
        break;
    }
    
    // Track invalidations
    if (score.invalidation.retraceOver50 || score.invalidation.backInsideRange) {
      this.metrics.invalidationCount++;
    }
    
    // Update average score
    this.metrics.avgScore = ((this.metrics.avgScore * (this.metrics.totalAnalyses - 1)) + score.score) / this.metrics.totalAnalyses;
    
    // Update average RR
    if (targets && targets.rrToTp1 > 0) {
      this.metrics.avgRR = ((this.metrics.avgRR * (this.metrics.totalAnalyses - 1)) + targets.rrToTp1) / this.metrics.totalAnalyses;
    }
    
    // Track follow-through success
    if (score.followThroughOk) {
      this.metrics.followThroughSuccess++;
    }
    
    // Track liquidity usage
    if (liquidity) {
      if (liquidity.near.type === 'SWING') this.metrics.liquidityUsage.swing++;
      else if (liquidity.near.type === 'ROUND_FIGURE') this.metrics.liquidityUsage.roundFigure++;
      else if (liquidity.near.type === 'VAH_VAL') this.metrics.liquidityUsage.vahVal++;
      else if (liquidity.near.type === 'OR') this.metrics.liquidityUsage.or++;
      else if (liquidity.near.type === 'ATR') this.metrics.liquidityUsage.atr++;
    }
    
    // Track score distribution
    if (score.score >= 0 && score.score < 2) this.metrics.scoreDistribution['0-2']++;
    else if (score.score >= 2 && score.score < 4) this.metrics.scoreDistribution['2-4']++;
    else if (score.score >= 4 && score.score < 6) this.metrics.scoreDistribution['4-6']++;
    else if (score.score >= 6 && score.score < 8) this.metrics.scoreDistribution['6-8']++;
    else if (score.score >= 8 && score.score <= 10) this.metrics.scoreDistribution['8-10']++;
    
    // Track RR distribution
    if (targets && targets.rrToTp1 > 0) {
      if (targets.rrToTp1 >= 1.0 && targets.rrToTp1 < 1.5) this.metrics.rrDistribution['1.0-1.5']++;
      else if (targets.rrToTp1 >= 1.5 && targets.rrToTp1 < 2.0) this.metrics.rrDistribution['1.5-2.0']++;
      else if (targets.rrToTp1 >= 2.0 && targets.rrToTp1 < 3.0) this.metrics.rrDistribution['2.0-3.0']++;
      else if (targets.rrToTp1 >= 3.0) this.metrics.rrDistribution['3.0+']++;
    }
    
    // Keep decision history (last 100)
    this.metrics.decisionHistory.push({
      timestamp: Date.now(),
      decision: score.decision,
      score: score.score,
      rr: targets ? targets.rrToTp1 : 0,
      isValid,
      direction: score.direction
    });
    
    if (this.metrics.decisionHistory.length > 100) {
      this.metrics.decisionHistory.shift();
    }
    
    // Keep recent analyses (last 20)
    this.metrics.recentAnalyses.push({
      timestamp: Date.now(),
      score: score.score,
      decision: score.decision,
      direction: score.direction,
      rr: targets ? targets.rrToTp1 : 0,
      bodyPct: score.bodyPct,
      trOverAtr: score.trOverAtr,
      volZ: score.volZ,
      structureBroke: score.structureBroke,
      htfAligned: score.htfAligned,
      isValid
    });
    
    if (this.metrics.recentAnalyses.length > 20) {
      this.metrics.recentAnalyses.shift();
    }
  }

  /**
   * Get current metrics summary
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      followRate: this.metrics.totalAnalyses > 0 ? (this.metrics.followCount / this.metrics.totalAnalyses * 100).toFixed(1) : 0,
      cautionRate: this.metrics.totalAnalyses > 0 ? (this.metrics.cautionCount / this.metrics.totalAnalyses * 100).toFixed(1) : 0,
      noFollowRate: this.metrics.totalAnalyses > 0 ? (this.metrics.noFollowCount / this.metrics.totalAnalyses * 100).toFixed(1) : 0,
      invalidationRate: this.metrics.totalAnalyses > 0 ? (this.metrics.invalidationCount / this.metrics.totalAnalyses * 100).toFixed(1) : 0,
      followThroughRate: this.metrics.totalAnalyses > 0 ? (this.metrics.followThroughSuccess / this.metrics.totalAnalyses * 100).toFixed(1) : 0
    };
  }

  /**
   * Get performance summary
   * @returns {Object} Performance metrics
   */
  getPerformanceSummary() {
    const metrics = this.getMetrics();
    
    return {
      totalAnalyses: metrics.totalAnalyses,
      decisionDistribution: {
        FOLLOW: `${metrics.followRate}%`,
        CAUTION: `${metrics.cautionRate}%`,
        NO_FOLLOW: `${metrics.noFollowRate}%`
      },
      quality: {
        avgScore: metrics.avgScore.toFixed(2),
        avgRR: metrics.avgRR.toFixed(2),
        followThroughRate: `${metrics.followThroughRate}%`,
        invalidationRate: `${metrics.invalidationRate}%`
      },
      liquidityUsage: metrics.liquidityUsage,
      scoreDistribution: metrics.scoreDistribution,
      rrDistribution: metrics.rrDistribution
    };
  }

  /**
   * Get recent trend analysis
   * @param {number} lookback - Number of recent analyses to consider
   * @returns {Object} Trend analysis
   */
  getTrendAnalysis(lookback = 20) {
    const recent = this.metrics.recentAnalyses.slice(-lookback);
    
    if (recent.length === 0) {
      return {
        trend: 'NO_DATA',
        avgScore: 0,
        followRate: 0,
        avgRR: 0
      };
    }
    
    const avgScore = recent.reduce((sum, r) => sum + r.score, 0) / recent.length;
    const followRate = recent.filter(r => r.decision === 'FOLLOW').length / recent.length * 100;
    const avgRR = recent.reduce((sum, r) => sum + r.rr, 0) / recent.length;
    
    // Determine trend
    let trend = 'STABLE';
    if (recent.length >= 10) {
      const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
      const secondHalf = recent.slice(Math.floor(recent.length / 2));
      
      const firstAvg = firstHalf.reduce((sum, r) => sum + r.score, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, r) => sum + r.score, 0) / secondHalf.length;
      
      if (secondAvg > firstAvg + 0.5) trend = 'IMPROVING';
      else if (secondAvg < firstAvg - 0.5) trend = 'DECLINING';
    }
    
    return {
      trend,
      avgScore: avgScore.toFixed(2),
      followRate: followRate.toFixed(1),
      avgRR: avgRR.toFixed(2),
      sampleSize: recent.length
    };
  }

  /**
   * Export metrics for external analysis
   * @returns {Object} Exportable metrics
   */
  export() {
    return {
      timestamp: new Date().toISOString(),
      metrics: this.getMetrics(),
      performance: this.getPerformanceSummary(),
      trend: this.getTrendAnalysis(),
      rawData: {
        decisionHistory: this.metrics.decisionHistory,
        recentAnalyses: this.metrics.recentAnalyses
      }
    };
  }

  /**
   * Print metrics to console
   */
  printMetrics() {
    const metrics = this.getMetrics();
    const performance = this.getPerformanceSummary();
    const trend = this.getTrendAnalysis();
    
    console.log('\n📊 MARUBOZU ANALYZER TELEMETRY');
    console.log('================================');
    console.log(`Total Analyses: ${metrics.totalAnalyses}`);
    console.log(`Follow Rate: ${metrics.followRate}%`);
    console.log(`Caution Rate: ${metrics.cautionRate}%`);
    console.log(`No Follow Rate: ${metrics.noFollowRate}%`);
    console.log(`Invalidation Rate: ${metrics.invalidationRate}%`);
    console.log(`Follow-Through Rate: ${metrics.followThroughRate}%`);
    console.log(`Average Score: ${performance.quality.avgScore}`);
    console.log(`Average RR: ${performance.quality.avgRR}`);
    console.log(`Trend: ${trend.trend}`);
    
    console.log('\n📈 Score Distribution:');
    Object.entries(metrics.scoreDistribution).forEach(([range, count]) => {
      console.log(`  ${range}: ${count} (${((count / metrics.totalAnalyses) * 100).toFixed(1)}%)`);
    });
    
    console.log('\n💰 RR Distribution:');
    Object.entries(metrics.rrDistribution).forEach(([range, count]) => {
      console.log(`  ${range}: ${count} (${((count / metrics.totalAnalyses) * 100).toFixed(1)}%)`);
    });
    
    console.log('\n🎯 Liquidity Usage:');
    Object.entries(metrics.liquidityUsage).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} (${((count / metrics.totalAnalyses) * 100).toFixed(1)}%)`);
    });
  }
}

// Create singleton instance
const telemetry = new MarubozuTelemetry();

module.exports = {
  MarubozuTelemetry,
  telemetry
};
