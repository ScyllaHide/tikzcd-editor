import {h, render, Component} from 'preact'
import classNames from 'classnames'
import copyText from 'copy-text-to-clipboard'
import * as diagram from '../diagram'

import Grid from './Grid'
import Properties from './Properties'
import Toolbox, {Button, Separator} from './Toolbox'

export default class App extends Component {
    constructor() {
        super()

        this.state = {
            tool: 'pan',
            cellSize: 130,
            selectedEdge: null,
            confirmLinkCopy: false,
            diagram: {nodes: [], edges: []},
            codePopupOpen: false
        }

        // Try to load a diagram from the hash if given

        if (window.location.hash.length > 0) {
            try {
                this.state.diagram = diagram.fromBase64(window.location.hash.slice(1))
            } catch (err) {
                alert('Invalid URL encoding')
            }
        }

        this.history = [{diagram: this.state.diagram, time: Date.now()}]
        this.historyPointer = 0
    }

    componentDidMount() {
        // Switch tool when holding Control and Space

        let toolControl = {
            18: 'arrow',    // Alt
            32: 'pan'       // Space
        }

        let actions = {
            27: 'close',    // Escape
            90: 'history',  // Z
        }

        document.addEventListener('keydown', evt => {
            if (toolControl[evt.keyCode] != null) {
                if (this.prevTool != null) return

                this.prevTool = this.state.tool
                this.setState({tool: toolControl[evt.keyCode]})
            }

            switch (actions[evt.keyCode]) {
                case 'close':
                    this.codePopup.value = ''
                    this.setState({codePopupOpen: false})
                    break
                case 'history':
                    if (evt.ctrlKey || evt.metaKey) {
                        if (!evt.shiftKey)
                            this.undo()
                        else
                            this.redo()
                    }
                    break
            }
        })

        document.addEventListener('keyup', evt => {
            if (Object.keys(toolControl).includes(evt.keyCode.toString())) {
                // Space or Control

                if (this.prevTool == null) return

                this.setState({tool: this.prevTool})
                this.prevTool = null
            }
        })

        document.addEventListener('keyup', evt => {
            if (evt.keyCode === 27) {
                // Escape

                this.setState({selectedEdge: null})
            }
        })

        window.addEventListener('beforeunload', evt => {
            let message = 'Do you really want to leave?'

            evt.returnValue = message
            return message
        })
    }

    copyLink = () => {
        if (this.state.confirmLinkCopy) return

        let encoded = diagram.toBase64(this.state.diagram)
        let base = window.location.href.split('#')[0]

        let url = base + '#' + encoded
        window.history.replaceState(null, null, '#' + encoded)

        let success = copyText(url)

        if (success) {
            this.setState({confirmLinkCopy: true})
            setTimeout(() => this.setState({confirmLinkCopy: false}), 1000)
        } else {
            prompt('Copy link down below:', url)
        }
    }

    openCodePopup = () => {
        let code = diagram.toTeX(this.state.diagram)
        this.codePopup.value = code
        this.codePopup.select()
        this.codePopup.focus()
        this.setState({
            codePopupOpen: true,
            selectedEdge: null
        })
    }

    handleCodePopupBlur = () => {
        if (document.activeElement === this.codePopup) return

        let currentCode = diagram.toTeX(this.state.diagram)
        let newCode = this.codePopup.value
        if (currentCode !== newCode) {
            try {
                this.setState({
                    diagram: diagram.fromTeX(newCode),
                    selectedEdge: null
                })
            } catch (err) {
                alert('Could not parse code. Reason: ' + err)
            }
        }

        this.codePopup.value = ''
        this.setState({codePopupOpen: false})
    }

    moveInHistory = step => {
        if (this.history[this.historyPointer + step] == null) return

        this.historyPointer += step

        this.setState({
            diagram: this.history[this.historyPointer].diagram,
            selectedEdge: null
        })
    }

    undo = () => {
        return this.moveInHistory(-1)
    }

    redo = () => {
        return this.moveInHistory(1)
    }

    handleDataChange = evt => {
        let edgeAdded = this.state.diagram.edges.length + 1 === evt.data.edges.length
        let historyEntry = {diagram: evt.data, time: Date.now()}

        if ((this.historyPointer < this.history.length - 1
        || Date.now() - this.history[this.historyPointer].time > 500)
        && this.history[this.historyPointer].diagram !== evt.data) {
            this.history.splice(this.historyPointer + 1, this.history.length, historyEntry)
            this.historyPointer = this.history.length - 1
        } else {
            this.history[this.historyPointer] = historyEntry
        }

        this.setState({
            diagram: evt.data,
            selectedEdge: edgeAdded ? evt.data.edges.length - 1 : this.state.selectedEdge
        })
    }

    handleEdgeClick = evt => {
        this.setState({selectedEdge: this.state.selectedEdge === evt.edge ? null : evt.edge})
    }

    handleToolClick = tool => {
        if (this.toolClickHandlersCache == null) this.toolClickHandlersCache = {}

        if (this.toolClickHandlersCache[tool] == null) {
            this.toolClickHandlersCache[tool] = evt => {
                this.setState({tool, selectedEdge: null})
            }
        }

        return this.toolClickHandlersCache[tool]
    }

    handleAboutClick = () => {
        let a = render((
            <a href="https://github.com/yishn/tikzcd-editor" target="_blank" />
        ), document.body)

        a.click()
        a.remove()
    }

    handleEdgeChange = evt => {
        let newEdges = [...this.state.diagram.edges]

        newEdges[this.state.selectedEdge] = {
            ...newEdges[this.state.selectedEdge],
            ...evt.data
        }

        if (evt.data.value != null && evt.data.value.trim() === '') {
            delete newEdges[this.state.selectedEdge].value
        }

        this.handleDataChange({
            data: {
                nodes: this.state.diagram.nodes,
                edges: newEdges
            }
        })
    }

    handleEdgeRemoveClick = () => {
        let newEdges = this.state.diagram.edges
            .filter((_, i) => i !== this.state.selectedEdge)

        let newNodes = this.state.diagram.nodes
            .filter(n => n.value.trim() !== '' || newEdges.some(e =>
                e.from === n.id || e.to === n.id
            ))

        this.handleDataChange({
            data: {
                nodes: newNodes,
                edges: newEdges
            }
        })

        this.setState({selectedEdge: null})
    }

    render() {
        return <div
            id="root"
            class={classNames({
                "code-popup-open": this.state.codePopupOpen
            })}
        >
            <Grid
                cellSize={this.state.cellSize}
                data={this.state.diagram}
                mode={this.state.tool}
                selectedEdge={this.state.selectedEdge}

                onDataChange={this.handleDataChange}
                onEdgeClick={this.handleEdgeClick}
            />

            <Properties
                edgeId={this.state.selectedEdge}
                show={this.state.selectedEdge != null}
                data={this.state.diagram.edges[this.state.selectedEdge]}

                onChange={this.handleEdgeChange}
                onRemoveClick={this.handleEdgeRemoveClick}
            />

            <Toolbox id="toolbox">
                <Button
                    checked={this.state.tool === 'pan'}
                    icon="./img/tools/pan.svg"
                    name="Pan Tool (Space)"
                    onClick={this.handleToolClick('pan')}
                />

                <Button
                    checked={this.state.tool === 'arrow'}
                    icon="./img/tools/arrow.svg"
                    name="Arrow Tool (Alt)"
                    onClick={this.handleToolClick('arrow')}
                />

                <Separator/>

                <Button
                    disabled={this.history[this.historyPointer - 1] == null}
                    icon="./img/tools/undo.svg"
                    name="Undo (Ctrl+Z or ⌘Z)"
                    onClick={this.undo}
                />

                <Button
                    disabled={this.history[this.historyPointer + 1] == null}
                    icon="./img/tools/redo.svg"
                    name="Redo (Ctrl+Shift+Z or ⇧⌘Z)"
                    onClick={this.redo}
                />

                <Separator/>

                <Button
                    checked={this.state.codePopupOpen}
                    icon="./img/tools/code.svg"
                    name="Open Popup with Code"
                    onClick={this.openCodePopup}
                />

                <Button
                    icon={`./img/tools/${this.state.confirmLinkCopy ? 'tick' : 'link'}.svg`}
                    name="Copy Diagram Permalink"
                    onClick={this.copyLink}
                />

                <Separator/>

                <Button
                    icon="./img/tools/about.svg"
                    name="GitHub Repository"
                    onClick={this.handleAboutClick}
                />
            </Toolbox>

            <textarea
                ref={el => this.codePopup = el}
                class="code-popup"

                onBlur={this.handleCodePopupBlur}
            />
        </div>
    }
}
