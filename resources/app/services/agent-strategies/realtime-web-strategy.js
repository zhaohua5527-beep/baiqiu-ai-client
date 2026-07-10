function createRealtimeWebStrategy(input, services) {
  return {
    name: "realtime_web_strategy",
    async execute() {
      return services.executeRealtimeWeb(input);
    }
  };
}

module.exports = { createRealtimeWebStrategy };
