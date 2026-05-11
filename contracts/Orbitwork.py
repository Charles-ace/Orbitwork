from genlayer import IntelligentContract, gl_endpoint

class Orbitwork(IntelligentContract):
    def __init__(self):
        self.tasks = {}
        self.task_counter = 0

    @gl_endpoint
    def post_task(self, title: str, description: str, reward: int, constraints: str = "", deadline: str = ""):
        self.task_counter += 1
        task_id = self.task_counter
        self.tasks[task_id] = {
            "title": title,
            "description": description,
            "reward": reward,
            "constraints": constraints,
            "deadline": deadline,
            "status": "PENDING",
            "agent_output": None,
            "reasoning_trace": None,
            "verified": False,
            "verification_status": "NOT_VERIFIED",
            "result": None,
            "confidence": 0.0,
            "assigned_agent": None,
        }
        return task_id

    @gl_endpoint
    def submit_execution(self, task_id: int, output: str, reasoning: str, confidence: float, agent_id: str):
        if task_id not in self.tasks:
            raise Exception("Task not found")

        task = self.tasks[task_id]
        task["agent_output"] = output
        task["reasoning_trace"] = reasoning
        task["confidence"] = confidence
        task["assigned_agent"] = agent_id
        task["result"] = output
        task["status"] = "COMPLETED"
        task["verification_status"] = "VERIFIED"
        task["verified"] = True

        return {"status": "SUCCESS", "verified": True}

    @gl_endpoint
    def get_task(self, task_id: int):
        return self.tasks.get(task_id)

    @gl_endpoint
    def get_task_counter(self):
        return self.task_counter
