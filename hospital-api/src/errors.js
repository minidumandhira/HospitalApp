// Throw this from anywhere in a route to stop and send a clear answer to the user:
//   throw new Problem(409, 'That is not possible right now.')
// Inside a database transaction, throwing also undoes everything the transaction had done.
export class Problem extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}