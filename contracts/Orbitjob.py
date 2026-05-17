# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Orbitjob(gl.Contract):
    tasks: TreeMap[int, dict]
    task_counter: int

    def __init__(self):
        self.tasks = TreeMap()
        self.task_counter = 0

    @gl.public.write
    def post_task(self, title: str, description: str, reward: int, constraints: str = "", deadline: str = "") -> int:
        self.task_counter += 1
        task_id = self.task_counter
        self.tasks[task_id] = {
            "title": title,
            "description": description,
            "reward": reward,
            "constraints": constraints,
            "deadline": deadline,
            "status": "PENDING",
            "agent_output": "",
            "reasoning_trace": "",
            "verified": False,
            "verification_status": "NOT_VERIFIED",
            "result": "",
            "confidence": 0.0,
            "assigned_agent": "",
        }
        return task_id

    @gl.public.write
    def submit_execution(self, task_id: int, output: str, reasoning: str, confidence: float, agent_id: str) -> dict:
        task = self.tasks[task_id]
        if not task:
            raise Exception("Task not found")

        task["agent_output"] = output
        task["reasoning_trace"] = reasoning
        task["confidence"] = confidence
        task["assigned_agent"] = agent_id
        task["result"] = output
        task["status"] = "COMPLETED"
        task["verification_status"] = "VERIFIED"
        task["verified"] = True
        
        self.tasks[task_id] = task

        return {"status": "SUCCESS", "verified": True}

    @gl.public.view
    def get_task(self, task_id: int) -> dict:
        return self.tasks[task_id]

    @gl.public.view
    def get_task_counter(self) -> int:
        return self.task_counter
