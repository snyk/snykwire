require.cache.fs = {
  exports: {
    readFileSync() {
      return 5;
    },
  },
};
