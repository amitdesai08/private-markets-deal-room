# Copyright (c) Microsoft. All rights reserved.

"""Microsoft Foundry hosted IQ router over the Responses protocol."""

from __future__ import annotations

import json
from typing import Annotated

from langchain_core.messages import AIMessage, BaseMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from routing import route_prompt
from typing_extensions import TypedDict

class State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    route: dict


def _message_text(message: BaseMessage) -> str:
    content = message.content
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(
            str(item.get("text", "")) if isinstance(item, dict) else str(item)
            for item in content
        )
    return str(content)


def create_graph():
    async def classify(state: State) -> dict:
        return {"route": route_prompt(_message_text(state["messages"][-1]))}

    async def render(state: State) -> dict:
        return {"messages": [AIMessage(content=json.dumps(state["route"]))]}

    builder = StateGraph(State)
    builder.add_node("classify", classify)
    builder.add_node("render", render)
    builder.add_edge(START, "classify")
    builder.add_edge("classify", "render")
    builder.add_edge("render", END)
    return builder.compile()
