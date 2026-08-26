interface GitLabResponseHeaders {
	[key: string]: string;
}

export class GitLabResponseError extends Error {
	public readonly status: number;
	public readonly message: string;
	public readonly headers: GitLabResponseHeaders;

	constructor(error: Error) {
		super(`GitLab API error ${error}: ${error.message}`);

		this.message = error.message;
		const glError = error as GitLabResponseError;
		this.status = glError.status ?? 400;
		this.headers = glError.headers ?? {};

		this.name = "GitLabResponseError";
	}
}
