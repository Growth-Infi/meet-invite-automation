class ApiError extends Error {
    statusCode
    constructor(
        status,
        message
    ) {
        super(message)
        this.statusCode = status
        this.message = message
    }
}

export default ApiError;