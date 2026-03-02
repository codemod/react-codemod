const config = {
  unstable_handleError(err: Error) {
    report(err);
  },
  onRetry() {},
};

export const ErrorHandler = () => null;
