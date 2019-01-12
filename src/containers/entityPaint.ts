import G from '../common/globals'
import util from '../common/util'
import factorioData from '../factorio-data/factorioData'
import { EntityContainer } from './entity'
import { AdjustmentFilter } from '@pixi/filter-adjustment'
import { UnderlayContainer } from './underlay'
import { InventoryContainer } from '../panels/inventory'

export class EntityPaintContainer extends PIXI.Container {
    areaVisualization: PIXI.Sprite | PIXI.Sprite[] | undefined
    directionType: string
    direction: number
    filter: AdjustmentFilter
    icon: PIXI.DisplayObject

    constructor(name: string, direction: number, position: IPoint) {
        super()
        this.name = name
        this.direction = direction
        this.directionType = 'input'
        this.position.set(position.x, position.y)
        this.filter = new AdjustmentFilter({ blue: 0.4 })
        this.filters = [this.filter]
        this.checkBuildable()

        this.interactive = true
        this.interactiveChildren = false
        this.buttonMode = true

        this.icon = InventoryContainer.createIcon(this.getItemName())
        this.icon.visible = false
        G.app.stage.addChild(this.icon)
        this.changeIconPos = this.changeIconPos.bind(this)
        window.addEventListener('mousemove', this.changeIconPos)
        this.changeIconPos(G.app.renderer.plugins.interaction.mouse.global)

        this.areaVisualization = G.BPC.underlayContainer.createNewArea(this.name)
        UnderlayContainer.modifyVisualizationArea(this.areaVisualization, s => {
            s.alpha += 0.25
            s.visible = true
        })
        G.BPC.underlayContainer.activateRelatedAreas(this.name)

        this.redraw()
    }

    changeIconPos(e: MouseEvent) {
        this.icon.position.set(e.x + 16, e.y + 16)
    }

    hide() {
        this.visible = false
        G.BPC.underlayContainer.deactivateActiveAreas()

        this.changeIconPos(G.app.renderer.plugins.interaction.mouse.global)
        this.icon.visible = true
    }

    show() {
        this.visible = true
        G.BPC.underlayContainer.activateRelatedAreas(this.name)

        this.icon.visible = false
    }

    destroy() {
        super.destroy()
        UnderlayContainer.modifyVisualizationArea(this.areaVisualization, s => s.destroy())
        G.BPC.underlayContainer.deactivateActiveAreas()
        G.BPC.overlayContainer.hideUndergroundLines()
        G.BPC.paintContainer = undefined

        window.removeEventListener('mousemove', this.changeIconPos)
        this.icon.destroy()
    }

    getItemName() {
        return factorioData.getEntity(this.name).minable.result
    }

    checkBuildable() {
        const position = EntityContainer.getGridPosition(this.position)
        const size = util.switchSizeBasedOnDirection(factorioData.getEntity(this.name).size, this.direction)
        if (!EntityContainer.isContainerOutOfBpArea(position, size) &&
            (G.bp.entityPositionGrid.checkFastReplaceableGroup(this.name, this.direction, position) ||
            G.bp.entityPositionGrid.checkSameEntityAndDifferentDirection(this.name, this.direction, position) ||
            G.bp.entityPositionGrid.checkNoOverlap(this.name, this.direction, position))
        ) {
            this.filter.red = 0.4
            this.filter.green = 1
        } else {
            this.filter.red = 1
            this.filter.green = 0.4
        }
    }

    updateUndergroundBeltRotation() {
        const fd = factorioData.getEntity(this.name)
        if (fd.type === 'underground_belt') {
            const otherEntity = G.bp.entityPositionGrid.findEntityWithSameNameAndDirection(
                this.name, (this.direction + 4) % 8, {
                    x: this.x / 32,
                    y: this.y / 32
                },
                this.direction,
                fd.max_distance
            )
            if (otherEntity) {
                const oe = G.bp.entity(otherEntity)
                this.directionType = oe.directionType === 'input' ? 'output' : 'input'
            } else {
                if (this.directionType === 'output') this.directionType = 'input'
            }
            this.redraw()
        }
    }

    updateUndergroundLines() {
        G.BPC.overlayContainer.updateUndergroundLines(
            this.name,
            { x: this.position.x / 32, y: this.position.y / 32 },
            this.directionType === 'input' ? this.direction : (this.direction + 4) % 8,
            this.name === 'pipe_to_ground' ? (this.direction + 4) % 8 : this.direction
        )
    }

    rotate(ccw = false) {
        const pr = factorioData.getEntity(this.name).possible_rotations
        if (!pr) return
        this.direction = pr[ (pr.indexOf(this.direction) + (ccw ? 3 : 1)) % pr.length ]
        this.redraw()
        const size = util.switchSizeBasedOnDirection(factorioData.getEntity(this.name).size, this.direction)
        if (size.x !== size.y) {
            const offset = G.gridData.calculateRotationOffset(this.position)
            this.x += offset.x * 32
            this.y += offset.y * 32

            const pos = EntityContainer.getPositionFromData(this.position, size)
            this.position.set(pos.x, pos.y)
        }
        this.checkBuildable()
        this.updateUndergroundBeltRotation()
        this.updateUndergroundLines()
    }

    redraw() {
        this.removeChildren()
        this.addChild(...EntityContainer.getParts({
            name: this.name,
            direction: this.directionType === 'output' ? (this.direction + 4) % 8 : this.direction,
            directionType: this.directionType
        }, G.hr, true))
        const size = util.switchSizeBasedOnDirection(factorioData.getEntity(this.name).size, this.direction)
        this.hitArea = new PIXI.Rectangle(
            -size.x * 16,
            -size.y * 16,
            size.x * 32,
            size.y * 32
        )
    }

    moveAtCursor() {
        const position = G.gridData.position

        switch (this.name) {
            case 'straight_rail':
            case 'curved_rail':
            case 'train_stop':
                this.position.set(
                    position.x - (position.x + G.railMoveOffset.x * 32) % 64 + 32,
                    position.y - (position.y + G.railMoveOffset.y * 32) % 64 + 32
                )
                break
            default:
                const size = util.switchSizeBasedOnDirection(factorioData.getEntity(this.name).size, this.direction)
                const pos = EntityContainer.getPositionFromData(position, size)
                this.position.set(pos.x, pos.y)
        }

        this.updateUndergroundBeltRotation()
        G.BPC.overlayContainer.updateUndergroundLinesPosition(this.position)
        this.updateUndergroundLines()

        UnderlayContainer.modifyVisualizationArea(this.areaVisualization, s => s.position.copy(this.position))

        this.checkBuildable()
    }

    removeContainerUnder() {
        const position = EntityContainer.getGridPosition(this.position)
        const c = EntityContainer.mappings.get(G.bp.entityPositionGrid.getCellAtPosition(position))
        if (c) {
            c.removeContainer()
            this.checkBuildable()
        }
    }

    placeEntityContainer() {
        const fd = factorioData.getEntity(this.name)
        const position = EntityContainer.getGridPosition(this.position)
        const size = util.switchSizeBasedOnDirection(fd.size, this.direction)
        if (EntityContainer.isContainerOutOfBpArea(position, size)) return

        const frgEntNr = G.bp.entityPositionGrid.checkFastReplaceableGroup(this.name, this.direction, position)
        if (frgEntNr) {
            const frgEnt = G.bp.entity(frgEntNr)
            frgEnt.change(this.name, this.direction)
            const c = EntityContainer.mappings.get(frgEntNr)
            c.redraw()
            c.redrawSurroundingEntities()
            c.redrawEntityInfo()
            return
        }
        const snEntNr = G.bp.entityPositionGrid.checkSameEntityAndDifferentDirection(
            this.name, this.direction, position
        )
        if (snEntNr) {
            G.bp.entity(snEntNr).direction = this.direction
            const c = EntityContainer.mappings.get(snEntNr)
            c.redraw()
            c.redrawSurroundingEntities()
            c.redrawEntityInfo()
            return
        }

        const isUB = fd.type === 'underground_belt'
        const res = G.bp.createEntity(this.name, position,
            isUB && this.directionType === 'output' ? (this.direction + 4) % 8 : this.direction,
            isUB ? this.directionType : undefined
        )
        if (res) {
            const ec = new EntityContainer(res)
            if (ec.areaVisualization) {
                if (ec.areaVisualization instanceof PIXI.Sprite) {
                    ec.areaVisualization.visible = true
                } else {
                    for (const s of ec.areaVisualization) s.visible = true
                }
            }
            G.BPC.entities.addChild(ec)
            ec.redrawSurroundingEntities()

            if (isUB || this.name === 'pipe_to_ground') {
                this.direction = (this.direction + 4) % 8
                this.redraw()
                G.BPC.overlayContainer.hideUndergroundLines()
            }

            G.BPC.updateOverlay()
        }

        this.checkBuildable()
    }
}